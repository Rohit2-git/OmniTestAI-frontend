import json
import os
from fastapi import APIRouter, HTTPException # type: ignore
from pydantic import BaseModel # type: ignore
from typing import List, Set
from app.database import db
from app.executors.web import WebExecutor
from app.executors.nl_executor import NLExecutor

router = APIRouter(prefix="/execute", tags=["execute"])

# Thread-safe in-memory global state cache to track operational abort triggers
ACTIVE_CANCELLATIONS: Set[str] = set()

class ExecuteRequest(BaseModel):
    run_id: int
    base_url: str

class ExecuteNLRequest(BaseModel):
    url: str
    steps: List[str]

class StopSuiteRequest(BaseModel):
    base_url: str


@router.post("/stop")
async def abort_suite_execution(payload: StopSuiteRequest):
    """Registers an asynchronous cancellation token to gracefully terminate active loops."""
    ACTIVE_CANCELLATIONS.add(payload.base_url)
    return {"status": "success", "message": f"Cancellation registered for {payload.base_url}"}


@router.post("/")
async def execute_test_suite(payload: ExecuteRequest):
    """
    Processes all tests sequentially in background headless mode, 
    assembling screenshots for the timeline dashboard slides.
    """
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
    Translates loose ad-hoc string operations into an autonomous visual screenshot stream.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Core automation framework requires GEMINI_API_KEY.")

    executor = NLExecutor()
    try:
        result = await executor.execute_raw_steps(url=payload.url, steps=payload.steps)
        return {
            "mode": "headful_nl_with_screenshots",
            "url": payload.url,
            "overall_status": "PASSED" if result.get("passed") else "FAILED",
            "passed": result.get("passed"),
            "total_steps": result.get("total_steps"),
            "executed_steps": result.get("executed_steps"),
            "step_results": result.get("step_results", []),
            "screenshots": result.get("screenshots", []),
            "video_base64": result.get("video_base64")
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

class DirectSuiteRequest(BaseModel):
    base_url: str
    test_cases: List[DirectTestCase]


@router.post("/single")
async def execute_single_direct(payload: DirectSingleRequest):
    """SINGLE TEST - headful first (user watches live), then headless for screenshots."""
    from app.executors.playwright import run_test_case
    test_case = {
        "title": payload.title,
        "steps": payload.steps,
        "expected_result": payload.expected_result,
        "type": "single"
    }

    headful_result = await run_test_case(
        test_case=test_case,
        base_url=payload.url,
        headful=True,
        capture_screenshots=False
    )

    headless_result = await run_test_case(
        test_case=test_case,
        base_url=payload.url,
        headful=False,
        capture_screenshots=True,
        record_video=True
    )

    return {
        "mode": "headful_single_with_screenshots",
        "title": headful_result["title"],
        "passed": headful_result["passed"],
        "type": headful_result.get("type"),
        "expected_result": headful_result["expected_result"],
        "total_steps": headful_result["total_steps"],
        "executed_steps": headful_result["executed_steps"],
        "step_results": headful_result["step_results"],
        "screenshots": headless_result.get("screenshots", []),
        "video_base64": headless_result.get("video_base64")
    }


@router.post("/suite")
async def execute_suite_direct(payload: DirectSuiteRequest):
    """SUITE RUN - headless + screenshots - direct payload no run_id needed with early cancellation breakout."""
    from app.executors.playwright import run_test_case
    
    # Reset any persistent old cancellation tokens matching this base target route environment profile URL
    if payload.base_url in ACTIVE_CANCELLATIONS:
        ACTIVE_CANCELLATIONS.remove(payload.base_url)

    execution_results = []
    total_passed = 0
    total_failed = 0
    was_aborted = False

    for tc in payload.test_cases:
        # Check cancellation token context before spawning a fresh browser target runner context thread loop
        if payload.base_url in ACTIVE_CANCELLATIONS:
            was_aborted = True
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
            record_video=True
        )
        
        execution_results.append(result)
        
        # Check cancellation state immediately after test execution routine concludes
        if payload.base_url in ACTIVE_CANCELLATIONS:
            if result["passed"]:
                total_passed += 1
            else:
                total_failed += 1
            was_aborted = True
            break

        if result["passed"]:
            total_passed += 1
        else:
            total_failed += 1
            break

    ran = total_passed + total_failed
    return {
        "mode": "headless_suite",
        "base_url": payload.base_url,
        "summary": {
            "total": len(payload.test_cases),
            "executed": ran,
            "passed": total_passed,
            "failed": total_failed,
            "not_run": len(payload.test_cases) - ran
        },
        "stopped_early": (total_failed > 0) or was_aborted,
        "results": execution_results
    }