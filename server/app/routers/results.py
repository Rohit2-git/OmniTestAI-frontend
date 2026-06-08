import json
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.responses import HTMLResponse
from app.database import db

router = APIRouter(prefix="/results", tags=["results"])


def _generate_html_report(run, er, exec_results) -> str:
    """Generate a full HTML execution report with inline screenshots."""

    # Build test case HTML blocks
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

    # Summary bar colors
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


@router.get("/")
async def list_all_runs():
    """List all test runs with their summary."""
    runs = await db.testrun.find_many(order={"createdAt": "desc"})
    return {
        "total_runs": len(runs),
        "runs": [
            {
                "run_id": r.id,
                "filename": r.filename,
                "total_test_cases": r.total,
                "status": r.status,
                "created_at": r.createdAt
            }
            for r in runs
        ]
    }


@router.get("/{run_id}")
async def get_result(run_id: int):
    """Get full test results for a specific run including all generated test cases."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    results = await db.testresult.find_many(
        where={"runId": run_id},
        order={"id": "asc"}
    )

    return {
        "run_id": run.id,
        "filename": run.filename,
        "status": run.status,
        "total": run.total,
        "created_at": run.createdAt,
        "test_cases": [
            {
                "id": r.id,
                "title": r.title,
                "steps": json.loads(r.steps),
                "expected_result": r.expectedResult,
                "type": r.type,
                "created_at": r.createdAt
            }
            for r in results
        ]
    }


@router.get("/{run_id}/execution")
async def get_execution_history(run_id: int):
    """Get all execution history for a test run, newest first."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    execution_runs = await db.executionrun.find_many(
        where={"runId": run_id},
        order={"createdAt": "desc"}
    )

    if not execution_runs:
        return {
            "run_id": run_id,
            "filename": run.filename,
            "total_executions": 0,
            "executions": []
        }

    executions = []
    for er in execution_runs:
        exec_results = await db.executionresult.find_many(
            where={"executionRunId": er.id},
            order={"id": "asc"}
        )
        executions.append({
            "execution_run_id": er.id,
            "base_url": er.baseUrl,
            "summary": {
                "total": er.total,
                "executed": er.executed,
                "passed": er.passed,
                "failed": er.failed,
                "not_run": er.notRun
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
                    "step_results": json.loads(r.stepResults)
                }
                for r in exec_results
            ]
        })

    return {
        "run_id": run_id,
        "filename": run.filename,
        "total_executions": len(executions),
        "executions": executions
    }


@router.get("/{run_id}/execution/latest")
async def get_latest_execution(run_id: int):
    """Get only the most recent execution for a test run."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

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
            "not_run": er.notRun
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
                "step_results": json.loads(r.stepResults)
            }
            for r in exec_results
        ]
    }


@router.get("/{run_id}/execution/latest/report", response_class=HTMLResponse)
async def get_latest_execution_report(run_id: int):
    """
    Generate and return a full HTML execution report for the latest run.
    Open this URL directly in your browser to see screenshots, pass/fail
    indicators, and a complete step-by-step visual breakdown.
    """
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

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

    html = _generate_html_report(run, er, exec_results)
    return HTMLResponse(content=html)


@router.delete("/{run_id}")
async def delete_run(run_id: int):
    """Delete a test run and all its test cases and execution history."""
    run = await db.testrun.find_unique(where={"id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {run_id}")

    execution_runs = await db.executionrun.find_many(where={"runId": run_id})
    for er in execution_runs:
        await db.executionresult.delete_many(where={"executionRunId": er.id})
    await db.executionrun.delete_many(where={"runId": run_id})
    await db.testresult.delete_many(where={"runId": run_id})
    await db.testrun.delete(where={"id": run_id})

    return {"message": f"Run {run_id} and all its test cases and execution history deleted successfully"}