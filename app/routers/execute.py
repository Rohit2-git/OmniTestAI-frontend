"""
Execute router — runs saved test cases against a live website.
Uses Stagehand for NL execution. Stops on first failure.
Takes a screenshot after each step and stores results in DB.
"""
import json
import os
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List
from app.database import db
from app.executors.web import WebExecutor
from app.executors.nl_executor import StagehandNLExecutor

router = APIRouter(prefix="/execute", tags=["execute"])


class ExecuteRequest(BaseModel):
    run_id: int
    base_url: str


class ExecuteNLRequest(BaseModel):
    url: str
    steps: List[str]


@router.post("/")
async def execute_test_run(payload: ExecuteRequest):
    """
    Execute all saved test cases for a run against a live website.
    Uses Stagehand AI — plain English steps, no selectors needed.
    Takes a screenshot after each step.
    Stops immediately on first failure. Saves results to DB.
    """
    run = await db.testrun.find_unique(where={"id": payload.run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {payload.run_id}")

    results = await db.testresult.find_many(
        where={"runId": payload.run_id},
        order={"id": "asc"}
    )
    if not results:
        raise HTTPException(status_code=404, detail="No test cases found for this run.")

    executor = WebExecutor()
    execution_results = []
    total_passed = 0
    total_failed = 0

    for tc in results:
        test_case = {
            "title": tc.title,
            "steps": json.loads(tc.steps),
            "expected_result": tc.expectedResult,
            "type": tc.type
        }

        result = await executor.execute_test_case(
            test_case=test_case,
            base_url=payload.base_url,
            continue_on_fail=False
        )

        execution_results.append(result)

        if result["passed"]:
            total_passed += 1
        else:
            total_failed += 1
            break

    ran = total_passed + total_failed
    remaining = len(results) - ran
    stopped_early = total_failed > 0

    # Save ExecutionRun summary to DB
    execution_run = await db.executionrun.create(data={
        "runId": payload.run_id,
        "baseUrl": payload.base_url,
        "total": len(results),
        "executed": ran,
        "passed": total_passed,
        "failed": total_failed,
        "notRun": remaining,
        "stoppedEarly": stopped_early
    })

    # Save each ExecutionResult — stepResults JSON includes screenshots
    for result in execution_results:
        await db.executionresult.create(data={
            "executionRunId": execution_run.id,
            "title": result["title"],
            "passed": result["passed"],
            "type": result.get("type") or "",
            "expectedResult": result.get("expected_result") or "",
            "agentOutput": result.get("agent_output") or "",
            "stepResults": json.dumps(result.get("step_results", []))
        })

    return {
        "run_id": payload.run_id,
        "execution_run_id": execution_run.id,
        "base_url": payload.base_url,
        "summary": {
            "total": len(results),
            "executed": ran,
            "passed": total_passed,
            "failed": total_failed,
            "not_run": remaining
        },
        "stopped_early": stopped_early,
        "results": execution_results
    }


@router.post("/single")
async def execute_single_test(payload: ExecuteRequest):
    """
    Execute only the first test case — quick sanity check.
    Takes a screenshot after each step.
    Does not save to DB.
    """
    run = await db.testrun.find_unique(where={"id": payload.run_id})
    if not run:
        raise HTTPException(status_code=404, detail=f"No test run found with id {payload.run_id}")

    results = await db.testresult.find_many(
        where={"runId": payload.run_id},
        order={"id": "asc"},
        take=1
    )
    if not results:
        raise HTTPException(status_code=404, detail="No test cases found for this run.")

    tc = results[0]
    test_case = {
        "title": tc.title,
        "steps": json.loads(tc.steps),
        "expected_result": tc.expectedResult,
        "type": tc.type
    }

    executor = WebExecutor()
    return await executor.execute_test_case(
        test_case=test_case,
        base_url=payload.base_url,
        continue_on_fail=False
    )


@router.post("/nl")
async def execute_nl_test(payload: ExecuteNLRequest):
    """
    NL Executor — send plain English steps directly without a saved run.
    Takes a screenshot after each step.
    Does not save to DB.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set in .env")

    executor = StagehandNLExecutor()
    try:
        results = await executor.execute_raw_steps(
            url=payload.url,
            steps=payload.steps
        )
        passed = all(r["status"] == "PASSED" for r in results)
        return {
            "url": payload.url,
            "overall_status": "PASSED" if passed else "FAILED",
            "total_steps": len(payload.steps),
            "executed_steps": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NL Execution failed: {str(e)}")