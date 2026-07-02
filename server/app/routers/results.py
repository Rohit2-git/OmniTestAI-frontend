import json
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Depends
# pyrefly: ignore [missing-import]
from fastapi.responses import HTMLResponse
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List, Optional
from app.database import db
from app.auth.middleware import get_current_user

router = APIRouter(prefix="/results", tags=["results"])


def _generate_html_report(run, er, exec_results) -> str:
    """Generate a full HTML execution report with inline screenshots."""
    test_case_blocks = ""
    for tc in exec_results:
        step_results = json.loads(tc.stepResults)
        overall_color = "#2ecc71" if tc.passed else "#e74c3c"
        overall_label = "PASSED" if tc.passed else "FAILED"

        steps_html = ""
        for i, step in enumerate(step_results):
            status = step.get("status", "").lower()
            step_color = "#2ecc71" if status == "passed" else "#e74c3c"
            step_label = "PASSED" if status == "passed" else "FAILED"
            screenshot = step.get("screenshot")

            screenshot_html = ""
            if screenshot:
                screenshot_html = f"""
                <div style="margin-top:10px;">
                    <div style="font-size:11px;color:#888;margin-bottom:4px;">Screenshot after step:</div>
                    <img src="{screenshot}"
                         style="width:100%;max-width:900px;border:1px solid #ddd;border-radius:6px;display:block;" />
                </div>"""
            else:
                screenshot_html = """
                <div style="margin-top:8px;font-size:11px;color:#aaa;font-style:italic;">
                    No screenshot available for this step.
                </div>"""

            steps_html += f"""
            <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;
                        padding:14px 18px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:13px;font-weight:600;color:#333;">
                        Step {i + 1}: {step.get('step', '')}
                    </div>
                    <span style="background:{step_color};color:#fff;padding:3px 10px;
                                 border-radius:12px;font-size:11px;font-weight:700;">
                        {step_label}
                    </span>
                </div>
                <div style="margin-top:6px;font-size:12px;color:#666;">
                    {step.get('detail', '')}
                </div>
                {screenshot_html}
            </div>"""

        test_case_blocks += f"""
        <div style="background:#f9f9f9;border:1px solid #ddd;border-radius:10px;
                    padding:20px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;
                        margin-bottom:14px;">
                <div>
                    <div style="font-size:16px;font-weight:700;color:#222;">{tc.title}</div>
                    <div style="font-size:12px;color:#888;margin-top:3px;">
                        Type: {tc.type or "N/A"} &nbsp;|&nbsp;
                        Expected: {tc.expectedResult or "N/A"}
                    </div>
                </div>
                <span style="background:{overall_color};color:#fff;padding:5px 14px;
                             border-radius:14px;font-size:12px;font-weight:700;">
                    {overall_label}
                </span>
            </div>
            {steps_html}
        </div>"""

    pass_pct = round((er.passed / er.executed * 100) if er.executed > 0 else 0)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>OmniTestAI — Execution Report (Run #{run.id})</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
               background: #f0f2f5; color: #333; padding: 32px 20px; }}
        .container {{ max-width: 1000px; margin: 0 auto; }}
        .header {{ background: linear-gradient(135deg, #1a1a2e, #16213e);
                   color: #fff; border-radius: 12px; padding: 28px 32px; margin-bottom: 24px; }}
        .header h1 {{ font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }}
        .header p {{ font-size: 13px; color: #aab; margin-top: 6px; }}
        .summary {{ display: grid; grid-template-columns: repeat(5, 1fr);
                    gap: 12px; margin-bottom: 28px; }}
        .stat {{ background: #fff; border-radius: 10px; padding: 16px;
                 text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }}
        .stat .num {{ font-size: 28px; font-weight: 800; }}
        .stat .label {{ font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; }}
        .stat.passed .num {{ color: #2ecc71; }}
        .stat.failed .num {{ color: #e74c3c; }}
        .stat.total .num {{ color: #3498db; }}
        .section-title {{ font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #222; }}
        .badge-stopped {{ background: #f39c12; color: #fff; padding: 4px 12px;
                          border-radius: 10px; font-size: 11px; font-weight: 700;
                          display: inline-block; margin-bottom: 16px; }}
        .footer {{ text-align: center; font-size: 11px; color: #aaa; margin-top: 32px; }}
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>OmniTestAI — Execution Report</h1>
        <p>
            Run #{run.id} &nbsp;|&nbsp;
            File: {run.filename} &nbsp;|&nbsp;
            URL: {er.baseUrl} &nbsp;|&nbsp;
            Executed: {er.createdAt.strftime("%Y-%m-%d %H:%M:%S") if er.createdAt else "N/A"}
        </p>
    </div>
    <div class="summary">
        <div class="stat total"><div class="num">{er.total}</div><div class="label">Total</div></div>
        <div class="stat"><div class="num" style="color:#8e44ad;">{er.executed}</div><div class="label">Executed</div></div>
        <div class="stat passed"><div class="num">{er.passed}</div><div class="label">Passed</div></div>
        <div class="stat failed"><div class="num">{er.failed}</div><div class="label">Failed</div></div>
        <div class="stat"><div class="num" style="color:#95a5a6;">{er.notRun}</div><div class="label">Not Run</div></div>
    </div>
    {"<div class='badge-stopped'>⚠ Stopped Early — First failure halted the run</div>" if er.stoppedEarly else ""}
    <div class="section-title">Test Case Results</div>
    {test_case_blocks}
    <div class="footer">Generated by OmniTestAI &nbsp;|&nbsp; {pass_pct}% pass rate</div>
</div>
</body>
</html>"""


def _build_visibility_filter(user) -> dict:
    """
    Build a Prisma `where` clause fragment that enforces visibility rules
    for the given user.

    Visibility values on TestRun:
      "all"             → everyone with app access can see it (admin-created)
      "qa_and_reviewer" → qa_engineer who created it + any qa_reviewer
      "owner_only"      → only the developer who created it

    Role rules:
      admin        → sees every run (no filter beyond app scoping)
      qa_engineer  → sees "all" runs + "qa_and_reviewer" runs they own
      developer    → sees "all" runs + "owner_only" runs they own
      qa_reviewer  → sees "all" runs + "qa_and_reviewer" runs only
                     (further app-scoped via UserAppAccess at the app level)
    """
    role = user.role

    if role == "admin":
        # Admins see everything — no visibility restriction
        return {}

    elif role == "qa_engineer":
        # Sees: all admin runs ("all") + qa_and_reviewer runs they personally created
        return {
            "OR": [
                {"visibility": "all"},
                {"visibility": "qa_and_reviewer", "createdByUserId": user.id},
            ]
        }

    elif role == "developer":
        # Sees: all admin runs ("all") + owner_only runs they personally created
        return {
            "OR": [
                {"visibility": "all"},
                {"visibility": "owner_only", "createdByUserId": user.id},
            ]
        }

    elif role == "qa_reviewer":
        # Sees: admin runs ("all") + any qa_engineer's runs ("qa_and_reviewer")
        # App scoping (UserAppAccess) is already enforced at the /auth/apps level
        return {
            "OR": [
                {"visibility": "all"},
                {"visibility": "qa_and_reviewer"},
            ]
        }

    # Unknown role — show nothing
    return {"id": -1}


@router.get("/")
async def list_all_runs(
    app_id: Optional[str] = None,
    current_user=Depends(get_current_user)
):
    """
    List test runs visible to the current user.
    - app_id scoping: always applied when provided
    - visibility scoping: applied based on role (see _build_visibility_filter)
    - qa_reviewer: additionally restricted to assigned apps only
    """
    # For qa_reviewer, enforce app assignment even if app_id not passed explicitly
    if current_user.role == "qa_reviewer":
        access_records = await db.userappaccess.find_many(
            where={"userId": current_user.id}
        )
        assigned_app_ids = [a.appId for a in access_records]

        if app_id:
            # Requested a specific app — verify they have access
            if app_id not in assigned_app_ids:
                return {"total_runs": 0, "runs": []}
            effective_app_ids = [app_id]
        else:
            effective_app_ids = assigned_app_ids

        if not effective_app_ids:
            return {"total_runs": 0, "runs": []}

        visibility_filter = _build_visibility_filter(current_user)
        where = {
            "appId": {"in": effective_app_ids},
            **visibility_filter
        }
    else:
        visibility_filter = _build_visibility_filter(current_user)
        if app_id:
            where = {"appId": app_id, **visibility_filter}
        else:
            where = visibility_filter if visibility_filter else {}

    runs = await db.testrun.find_many(where=where, order={"createdAt": "desc"})
    return {
        "total_runs": len(runs),
        "runs": [
            {
                "run_id": r.id,
                "filename": r.filename,
                "batch_name": r.batchName,
                "display_label": r.batchName or r.filename,
                "total_test_cases": r.total,
                "status": r.status,
                "created_at": r.createdAt,
                "app_id": r.appId,
                "created_by_role": r.createdByRole,
            }
            for r in runs
        ]
    }


@router.get("/{run_id}")
async def get_result(run_id: int, current_user=Depends(get_current_user)):
    """
    Get full test results for a specific run.
    Enforces the same visibility rules as list_all_runs so a user
    cannot bypass the filter by guessing a run_id directly.
    """
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    # Enforce visibility
    _assert_run_visible(run, current_user)

    results = await db.testresult.find_many(
        where={"runId": run_id},
        order={"id": "asc"}
    )

    return {
        "run_id": run.id,
        "filename": run.filename,
        "batch_name": run.batchName,
        "display_label": run.batchName or run.filename,
        "status": run.status,
        "total": run.total,
        "created_at": run.createdAt,
        "app_id": run.appId,
        "created_by_role": run.createdByRole,
        "test_cases": [
            {
                "id": r.id,
                "title": r.title,
                "steps": json.loads(r.steps) if r.steps else [],
                "expected_result": r.expectedResult,
                "type": r.type,
                "created_at": r.createdAt,
                "test_data_source_type": r.testDataSourceType,
                "test_data_source_id": r.testDataSourceId,
                "test_data_values": json.loads(r.testDataValues) if r.testDataValues else None,
            }
            for r in results
        ]
    }


@router.get("/{run_id}/execution")
async def get_execution_history(run_id: int, current_user=Depends(get_current_user)):
    """Get all execution runs for a test run."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    _assert_run_visible(run, current_user)

    executions = await db.executionrun.find_many(
        where={"runId": run_id},
        order={"createdAt": "desc"}
    )

    result = []
    for er in executions:
        exec_results = await db.executionresult.find_many(
            where={"executionRunId": er.id},
            order={"id": "asc"}
        )
        result.append({
            "execution_run_id": er.id,
            "base_url": er.baseUrl,
            "executed_at": er.createdAt,
            "summary": {
                "total": er.total,
                "executed": er.executed,
                "passed": er.passed,
                "failed": er.failed,
                "not_run": er.notRun,
            },
            "stopped_early": er.stoppedEarly,
            "test_case_results": [
                {
                    "title": r.title,
                    "passed": r.passed,
                    "type": r.type,
                    "expected_result": r.expectedResult,
                    "agent_output": r.agentOutput,
                    "step_results": json.loads(r.stepResults),
                    "screenshot_paths": json.loads(r.screenshotPaths) if r.screenshotPaths else [],
                    "video_path": r.videoPath,
                }
                for r in exec_results
            ]
        })

    return {
        "run_id": run_id,
        "filename": run.filename,
        "total_executions": len(result),
        "executions": result,
    }


@router.get("/{run_id}/execution/latest")
async def get_latest_execution(run_id: int, current_user=Depends(get_current_user)):
    """Get the most recent execution for a test run."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    _assert_run_visible(run, current_user)

    execution_runs = await db.executionrun.find_many(
        where={"runId": run_id},
        order={"createdAt": "desc"},
        take=1
    )

    if not execution_runs:
        raise HTTPException(status_code=404, detail=f"No execution history found for run {run_id}")

    er = execution_runs[0]
    exec_results = await db.executionresult.find_many(
        where={"executionRunId": er.id},
        order={"id": "asc"}
    )

    def _enrich_steps(step_results: list, screenshot_paths: list) -> list:
        has_embedded = any(s.get("image_path") for s in step_results)
        if has_embedded:
            return step_results
        enriched = []
        path_iter = iter(screenshot_paths)
        for s in step_results:
            entry = dict(s)
            try:
                entry["image_path"] = next(path_iter)
            except StopIteration:
                entry.setdefault("image_path", None)
            enriched.append(entry)
        return enriched

    return {
        "run_id": run_id,
        "filename": run.filename,
        "execution_run_id": er.id,
        "base_url": er.baseUrl,
        "summary": {
            "total": er.total,
            "executed": er.executed,
            "passed": er.passed,
            "failed": er.failed,
            "not_run": er.notRun,
        },
        "stopped_early": er.stoppedEarly,
        "executed_at": er.createdAt,
        "test_case_results": [
            {
                "title": r.title,
                "passed": r.passed,
                "type": r.type,
                "expected_result": r.expectedResult,
                "agent_output": r.agentOutput,
                "step_results": _enrich_steps(
                    json.loads(r.stepResults),
                    json.loads(r.screenshotPaths) if r.screenshotPaths else []
                ),
                "screenshot_paths": json.loads(r.screenshotPaths) if r.screenshotPaths else [],
                "video_path": r.videoPath,
            }
            for r in exec_results
        ]
    }


@router.get("/{run_id}/execution/latest/report", response_class=HTMLResponse)
async def get_latest_execution_report(run_id: int, current_user=Depends(get_current_user)):
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    _assert_run_visible(run, current_user)

    execution_runs = await db.executionrun.find_many(
        where={"runId": run_id},
        order={"createdAt": "desc"},
        take=1
    )
    if not execution_runs:
        raise HTTPException(status_code=404, detail=f"No execution history found for run {run_id}")

    er = execution_runs[0]
    exec_results = await db.executionresult.find_many(
        where={"executionRunId": er.id},
        order={"id": "asc"}
    )
    return HTMLResponse(content=_generate_html_report(run, er, exec_results))


@router.delete("/{run_id}")
async def delete_run(run_id: int, current_user=Depends(get_current_user)):
    """Delete a test run. Only the creator or admin can delete."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    # Only the creator or an admin can delete
    if current_user.role != "admin" and run.createdByUserId != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this run.")

    execution_runs = await db.executionrun.find_many(where={"runId": run_id})
    for er in execution_runs:
        await db.executionresult.delete_many(where={"executionRunId": er.id})
    await db.executionrun.delete_many(where={"runId": run_id})
    await db.testresult.delete_many(where={"runId": run_id})
    await db.testrun.delete(where={"id": run_id})

    return {"message": f"Run {run_id} and all its data deleted successfully"}


class DeleteResultsByTitleRequest(BaseModel):
    app_id: Optional[str] = None
    titles: List[str]


@router.post("/execution/delete-by-title")
async def delete_execution_results_by_title(
    payload: DeleteResultsByTitleRequest,
    current_user=Depends(get_current_user)
):
    if not payload.titles:
        return {"deleted_count": 0, "message": "No titles provided"}

    where_runs: dict = {}
    if payload.app_id:
        where_runs["appId"] = payload.app_id

    # Scope deletion to runs the current user owns (or all if admin)
    if current_user.role != "admin":
        where_runs["createdByUserId"] = current_user.id

    candidate_runs = await db.testrun.find_many(where=where_runs)
    candidate_run_ids = {r.id for r in candidate_runs}

    execution_runs = await db.executionrun.find_many(
        where={"runId": {"in": list(candidate_run_ids)}} if candidate_run_ids else {"id": -1}
    )
    execution_run_ids = [er.id for er in execution_runs]

    if not execution_run_ids:
        return {"deleted_count": 0, "message": "No matching execution history found"}

    deleted_count = await db.executionresult.delete_many(
        where={
            "executionRunId": {"in": execution_run_ids},
            "title": {"in": payload.titles},
        }
    )

    for er in execution_runs:
        remaining = await db.executionresult.find_many(where={"executionRunId": er.id})
        if not remaining:
            await db.executionrun.delete(where={"id": er.id})
            sibling_runs = await db.executionrun.find_many(where={"runId": er.runId})
            if not sibling_runs:
                await db.testresult.delete_many(where={"runId": er.runId})
                await db.testrun.delete(where={"id": er.runId})

    return {"deleted_count": deleted_count, "message": f"Deleted {deleted_count} execution result(s)"}


# ── Internal helper ────────────────────────────────────────────────────────

def _assert_run_visible(run, user):
    """
    Raises 403 if the given user is not allowed to see this specific run.
    Mirrors the same logic as _build_visibility_filter but for a single run.
    """
    role = user.role
    visibility = getattr(run, "visibility", "all") or "all"

    if role == "admin":
        return  # admin sees all

    if visibility == "all":
        return  # everyone can see admin-created runs

    if visibility == "qa_and_reviewer":
        if role == "qa_reviewer":
            return  # qa_reviewer can see qa_engineer runs
        if role == "qa_engineer" and run.createdByUserId == user.id:
            return  # qa_engineer sees their own
        raise HTTPException(status_code=403, detail="Access denied.")

    if visibility == "owner_only":
        if run.createdByUserId == user.id:
            return  # creator sees their own
        raise HTTPException(status_code=403, detail="Access denied.")

    raise HTTPException(status_code=403, detail="Access denied.")