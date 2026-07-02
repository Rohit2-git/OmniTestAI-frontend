import json
import os
import threading
from fastapi import APIRouter, HTTPException # type: ignore
from pydantic import BaseModel, Field # type: ignore
from typing import List, Set, Optional, Dict
from app.database import db
from app.executors.web import WebExecutor
from app.executors.nl_executor import NLExecutor
from app.services.media_storage import SCREENSHOTS_DIR, VIDEOS_DIR


def _delete_media_file(web_path: str | None):
    """Delete a screenshot or video from disk given its web-relative path. Best-effort."""
    if not web_path:
        return
    try:
        if web_path.startswith("/media/screenshots/"):
            full = os.path.join(SCREENSHOTS_DIR, os.path.basename(web_path))
        elif web_path.startswith("/media/videos/"):
            full = os.path.join(VIDEOS_DIR, os.path.basename(web_path))
        else:
            return
        if os.path.exists(full):
            os.remove(full)
    except OSError:
        pass

router = APIRouter(prefix="/execute", tags=["execute"])

# Legacy set — kept for backward compat with playwright.py checks
ACTIVE_CANCELLATIONS: Set[str] = set()

# New: per-base_url threading Events so _run_playwright (in its own thread)
# can be woken up mid-step without waiting for the current step to finish.
_CANCEL_EVENTS: Dict[str, threading.Event] = {}

class ExecuteRequest(BaseModel):
    run_id: int
    base_url: str

class ExecuteNLRequest(BaseModel):
    url: str
    steps: List[str]
    appId: str = Field(..., description="Active environment cluster target linkage identifier token")
    max_steps: int = 8

class StopSuiteRequest(BaseModel):
    base_url: str


@router.post("/stop")
async def abort_suite_execution(payload: StopSuiteRequest):
    """Registers cancellation — sets both the legacy set and the threading Event."""
    ACTIVE_CANCELLATIONS.add(payload.base_url)
    # Signal the threading.Event so _run_playwright wakes up immediately
    # even if it's blocked mid-step waiting on a Playwright await.
    if payload.base_url in _CANCEL_EVENTS:
        _CANCEL_EVENTS[payload.base_url].set()
    return {"status": "success", "message": f"Cancellation registered for {payload.base_url}"}


@router.post("/")
async def execute_test_suite(payload: ExecuteRequest):
    """Processes all tests sequentially in background headless mode."""
    run = await db.testrun.find_unique(where={"id": payload.run_id})
    if not run:
        raise HTTPException(status_code=404, detail="Target run configuration missing.")

    results = await db.testresult.find_many(where={"runId": payload.run_id}, order={"id": "asc"})
    
    executor = WebExecutor()
    execution_results = []
    
    for tc in results:
        test_case = {
            "title": tc.title, 
            "steps": json.loads(tc.steps), 
            "expected_result": tc.expectedResult, 
            "type": tc.type
        }
        result = await executor.execute_test_case_headless(test_case=test_case, base_url=payload.base_url)
        execution_results.append(result)
        
        if not result.get("passed", False): 
            break 

    return {
        "mode": "headless_suite", 
        "results": execution_results
    }


@router.post("/nl")
async def execute_nl_test(payload: ExecuteNLRequest):
    """
    Executes autonomous goals using your exact unmodified file instance,
    then intercepts and commits historical execution records to permanent database tables.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Core automation framework requires GEMINI_API_KEY.")

    full_goal_statement = " ".join(payload.steps).strip()
    if not full_goal_statement:
         raise HTTPException(status_code=400, detail="Empty text goal provided.")

    executor = NLExecutor()
    try:
        # Invoking your original unmodified method logic
        result = await executor.execute_autonomous_goal(
            url=payload.url,
            goal=full_goal_statement,
            max_steps=payload.max_steps,
            app_id=payload.appId,
            batch_label=f"NL: {full_goal_statement[:40]}"
        )
        
        # 💾 PERMANENT DATABASE RECORD INTERCEPTION
        saved_run = await db.testrun.create(data={
            "filename": f"NL: {full_goal_statement[:40]}...",
            "total": 1,
            "status": "completed" if (result.get("passed") or result.get("overall_status") == "PASSED") else "failed",
            "appId": payload.appId
        })
        
        # Format live actions telemetry seamlessly into string maps
        serializable_steps = [res.get("step", "") for res in result.get("step_results", [])]
        
        await db.testresult.create(data={
            "runId": saved_run.id,
            "title": f"Autonomous Run Goal — '{full_goal_statement[:50]}'",
            "steps": json.dumps(serializable_steps),
            "expectedResult": "Autonomous completion criteria verified by agent model.",
            "type": "natural_language"
        })

        # Save an explicit ExecutionRun mapping entry to populate the global useApp history hook automatically
        created_run_log = await db.executionrun.create(data={
            "runId": saved_run.id,
            "baseUrl": payload.url,
            "total": 1,
            "executed": 1,
            "passed": 1 if (result.get("passed") or result.get("overall_status") == "PASSED") else 0,
            "failed": 0 if (result.get("passed") or result.get("overall_status") == "PASSED") else 1,
            "notRun": 0,
            "stoppedEarly": False
        })

        # Format and append execution log string records safely
        log_records = []
        for step in result.get("step_results", []):
            log_records.append({
                "step_number": step.get("step_number"),
                "step": step.get("step"),
                "status": step.get("status"),
                "detail": step.get("detail", "")
            })

        await db.executionresult.create(data={
            "executionRunId": created_run_log.id,
            "title": f"Autonomous Run Goal — '{full_goal_statement[:50]}'",
            "passed": True if (result.get("passed") or result.get("overall_status") == "PASSED") else False,
            "type": "natural_language",
            "expectedResult": "Autonomous criteria verified.",
            "agentOutput": json.dumps(result.get("step_results", [])),
            "stepResults": json.dumps(log_records),
            "screenshotPaths": json.dumps(result.get("screenshot_paths", [])),
            "videoPath": result.get("video_path")
        })

        return {
            "mode": "autonomous_agent_goal_run",
            "url": payload.url,
            "overall_status": "PASSED" if (result.get("passed") or result.get("overall_status") == "PASSED") else "FAILED",
            "passed": result.get("passed") or result.get("overall_status") == "PASSED",
            "total_steps": result.get("total_steps"),
            "executed_steps": result.get("executed_steps"),
            "step_results": result.get("step_results", []),
            "screenshots": result.get("screenshots", []),
            "screenshot_paths": result.get("screenshot_paths", []),
            "video_base64": result.get("video_base64"),
            "video_path": result.get("video_path")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DirectTestCase(BaseModel):
    title: str
    steps: List[str]
    expected_result: str = ""
    type: str = "functional"

class DirectSingleRequest(BaseModel):
    url: str
    steps: List[str]
    title: str = "Single Test"
    expected_result: str = ""
    appId: Optional[str] = None

class DirectSuiteRequest(BaseModel):
    base_url: str
    test_cases: List[DirectTestCase]
    appId: Optional[str] = None


@router.post("/single")
async def execute_single_direct(payload: DirectSingleRequest):
    """SINGLE TEST - headful first (user watches live), then headless for screenshots."""
    from app.executors.playwright import run_test_case
    import time as _time

    test_case = {
        "title": payload.title,
        "steps": payload.steps,
        "expected_result": payload.expected_result,
        "type": "single"
    }
    batch_label = f"Execute: {payload.title} · {_time.strftime('%H:%M:%S')}"

    headful_result = await run_test_case(
        test_case=test_case,
        base_url=payload.url,
        headful=True,
        capture_screenshots=False,
        app_id=payload.appId,
        batch_label=batch_label
    )

    headless_result = await run_test_case(
        test_case=test_case,
        base_url=payload.url,
        headful=False,
        capture_screenshots=True,
        record_video=True,
        app_id=payload.appId,
        batch_label=batch_label
    )

    # Persist so this result survives a page reload, same as NL execution.
    saved_run = await db.testrun.create(data={
        "filename": payload.title,
        "total": 1,
        "status": "completed" if headful_result["passed"] else "failed",
        "appId": payload.appId
    })
    created_run_log = await db.executionrun.create(data={
        "runId": saved_run.id,
        "baseUrl": payload.url,
        "total": 1,
        "executed": 1,
        "passed": 1 if headful_result["passed"] else 0,
        "failed": 0 if headful_result["passed"] else 1,
        "notRun": 0,
        "stoppedEarly": False
    })
    await db.executionresult.create(data={
        "executionRunId": created_run_log.id,
        "title": payload.title,
        "passed": headful_result["passed"],
        "type": "single",
        "expectedResult": payload.expected_result or "Passed",
        "agentOutput": json.dumps(headful_result.get("step_results", [])),
        # Use headless_result here, not headful_result: the headful pass runs with
        # capture_screenshots=False (it's just for live viewing), so its step_results
        # never carry image_path no matter what. headless_result is the pass that
        # actually captured screenshots, so it's the one whose step_results contain
        # the image_path each step needs for the slideshow to survive a reload.
        "stepResults": json.dumps(headless_result.get("step_results", [])),
        "screenshotPaths": json.dumps(headless_result.get("screenshot_paths", [])),
        "videoPath": headless_result.get("video_path")
    })

    return {
        "mode": "headful_single_with_screenshots",
        "run_id": saved_run.id,
        "title": headful_result["title"],
        "passed": headful_result["passed"],
        "type": headful_result.get("type"),
        "expected_result": headful_result["expected_result"],
        "total_steps": headful_result["total_steps"],
        "executed_steps": headful_result["executed_steps"],
        "step_results": headful_result["step_results"],
        "screenshots": headless_result.get("screenshots", []),
        "screenshot_paths": headless_result.get("screenshot_paths", []),
        "video_base64": headless_result.get("video_base64"),
        "video_path": headless_result.get("video_path")
    }


@router.post("/suite")
async def execute_suite_direct(payload: DirectSuiteRequest):
    """SUITE RUN - headless + screenshots with real-time memory and storage reclamation."""
    from app.executors.playwright import run_test_case
    import time as _time

    if payload.base_url in ACTIVE_CANCELLATIONS:
        ACTIVE_CANCELLATIONS.remove(payload.base_url)

    # Create a fresh cancel Event for this run — cleared so it starts unsignalled.
    cancel_event = threading.Event()
    _CANCEL_EVENTS[payload.base_url] = cancel_event

    batch_label = f"Execute: Suite ({len(payload.test_cases)} tests) · {_time.strftime('%H:%M:%S')}"

    # Persist so this suite's results survive a page reload, same as NL execution.
    saved_run = await db.testrun.create(data={
        "filename": f"Suite ({len(payload.test_cases)} tests)",
        "total": len(payload.test_cases),
        "status": "running",
        "appId": payload.appId
    })
    created_run_log = await db.executionrun.create(data={
        "runId": saved_run.id,
        "baseUrl": payload.base_url,
        "total": len(payload.test_cases),
        "executed": 0,
        "passed": 0,
        "failed": 0,
        "notRun": len(payload.test_cases),
        "stoppedEarly": False
    })

    execution_results = []
    total_passed = 0
    total_failed = 0
    was_aborted = False

    for i, tc in enumerate(payload.test_cases):
        if payload.base_url in ACTIVE_CANCELLATIONS:
            was_aborted = True
            for remaining_tc in payload.test_cases[i:]:
                execution_results.append({
                    "title": remaining_tc.title,
                    "passed": False,
                    "type": remaining_tc.type,
                    "expected_result": remaining_tc.expected_result,
                    "total_steps": len(remaining_tc.steps),
                    "executed_steps": 0,
                    "step_results": [{
                        "step_number": 1,
                        "step": "Suite Run Aborted",
                        "status": "failed",
                        "detail": "Execution canceled safely by user profile control loop."
                    }],
                    "screenshots": [],
                    "video_base64": None
                })
            break

        test_case = {
            "title": tc.title,
            "steps": tc.steps,
            "expected_result": tc.expected_result,
            "type": tc.type
        }
        
        result = await run_test_case(
            test_case=test_case,
            base_url=payload.base_url,
            headful=False,
            capture_screenshots=True,
            record_video=True,
            app_id=payload.appId,
            batch_label=batch_label,
            cancel_event=cancel_event
        )
        
        execution_results.append(result)

        await db.executionresult.create(data={
            "executionRunId": created_run_log.id,
            "title": result.get("title", tc.title),
            "passed": result.get("passed", False),
            "type": result.get("type", tc.type),
            "expectedResult": result.get("expected_result", tc.expected_result or "Passed"),
            "agentOutput": json.dumps(result.get("step_results", [])),
            "stepResults": json.dumps(result.get("step_results", [])),
            "screenshotPaths": json.dumps(result.get("screenshot_paths", [])),
            "videoPath": result.get("video_path")
        })

        if payload.base_url in ACTIVE_CANCELLATIONS or result.get("stop_reason") == "aborted":
            was_aborted = True
            for remaining_tc in payload.test_cases[i+1:]:
                execution_results.append({
                    "title": remaining_tc.title,
                    "passed": False,
                    "type": remaining_tc.type,
                    "expected_result": remaining_tc.expected_result,
                    "total_steps": len(remaining_tc.steps),
                    "executed_steps": 0,
                    "step_results": [{
                        "step_number": 1,
                        "step": "Suite Run Aborted",
                        "status": "failed",
                        "detail": "Execution canceled safely by user profile control loop."
                    }],
                    "screenshots": [],
                    "video_base64": None
                })
            break

        if result["passed"]:
            total_passed += 1
        else:
            total_failed += 1
            break

    if payload.base_url in ACTIVE_CANCELLATIONS:
        ACTIVE_CANCELLATIONS.remove(payload.base_url)
    _CANCEL_EVENTS.pop(payload.base_url, None)

    ran = total_passed + total_failed

    if was_aborted:
        # User stopped the run — purge all partial data: DB rows + disk files.
        # Nothing from an aborted run should survive.
        try:
            exec_results_rows = await db.executionresult.find_many(
                where={"executionRunId": created_run_log.id}
            )
            for result in exec_results_rows:
                try:
                    step_results = json.loads(result.stepResults) if result.stepResults else []
                    for step in step_results:
                        _delete_media_file(step.get("image_path"))
                except Exception:
                    pass
                try:
                    paths = json.loads(result.screenshotPaths) if result.screenshotPaths else []
                    for p in paths:
                        _delete_media_file(p)
                except Exception:
                    pass
                _delete_media_file(result.videoPath)

            await db.executionresult.delete_many(where={"executionRunId": created_run_log.id})
            await db.executionrun.delete(where={"id": created_run_log.id})
            await db.testresult.delete_many(where={"runId": saved_run.id})
            await db.testrun.delete(where={"id": saved_run.id})
        except Exception as _cleanup_err:
            print(f"[Abort cleanup error] {_cleanup_err}")

        return {
            "mode": "headless_suite",
            "run_id": None,
            "base_url": payload.base_url,
            "summary": {
                "total": len(payload.test_cases),
                "executed": ran,
                "passed": total_passed,
                "failed": total_failed,
                "not_run": len(payload.test_cases) - ran
            },
            "stopped_early": True,
            "aborted": True,
            "results": []
        }

    # Normal finish — finalize the run summary.
    await db.executionrun.update(where={"id": created_run_log.id}, data={
        "executed": ran,
        "passed": total_passed,
        "failed": total_failed,
        "notRun": len(payload.test_cases) - ran,
        "stoppedEarly": total_failed > 0
    })
    await db.testrun.update(where={"id": saved_run.id}, data={
        "status": "completed" if total_failed == 0 else "failed"
    })

    return {
        "mode": "headless_suite",
        "run_id": saved_run.id,
        "base_url": payload.base_url,
        "summary": {
            "total": len(payload.test_cases),
            "executed": ran,
            "passed": total_passed,
            "failed": total_failed,
            "not_run": len(payload.test_cases) - ran
        },
        "stopped_early": total_failed > 0,
        "results": execution_results
    }