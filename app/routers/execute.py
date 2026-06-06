import json
import os
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List
from app.database import db
from app.executors.web import WebExecutor
from app.executors.nl_executor import NLExecutor
from app.executors.playwright import run_test_case

router = APIRouter(prefix="/execute", tags=["execute"])


class ExecuteRequest(BaseModel):
    run_id: int
    base_url: str


class ExecuteNLRequest(BaseModel):
    url: str
    steps: List[str]


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


@router.post("/")
async def execute_test_suite(payload: ExecuteRequest):
    """Headless suite run with screenshots from saved run_id."""
    run = await db.testrun.find_unique(where={"id": payload.run_id})
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    results = await db.testresult.find_many(
        where={"runId": payload.run_id}, order={"id": "asc"}
    )

    executor = WebExecutor()
    execution_results = []

    for tc in results:
        test_case = {
            "title": tc.title,
            "steps": json.loads(tc.steps),
            "expected_result": tc.expectedResult,
            "type": tc.type
        }
        result = await executor.execute_test_case_headless(
            test_case=test_case, base_url=payload.base_url
        )
        execution_results.append(result)
        if not result.get("passed", False):
            break

    return {"mode": "headless_suite", "results": execution_results}


# Replace ONLY the @router.post("/nl") function in app/routers/execute.py with this:

@router.post("/nl")
async def execute_nl_test(payload: ExecuteNLRequest):
    """
    NL EXECUTOR — runs headful (user watches live) then headless (capture screenshots).
    Returns step trace + screenshot slideshow.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set in .env")

    executor = NLExecutor()
    try:
        result = await executor.execute_raw_steps(url=payload.url, steps=payload.steps)
        return {
            "mode": "headful_nl_with_screenshots",
            "url": payload.url,
            "overall_status": "PASSED" if result["passed"] else "FAILED",
            "passed": result["passed"],
            "total_steps": len(payload.steps),
            "executed_steps": result["executed_steps"],
            "step_results": result["step_results"],
            "screenshots": result.get("screenshots", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/single")
async def execute_single_direct(payload: DirectSingleRequest):
    """
    SINGLE TEST — runs TWICE:
    1. Headful — user watches live
    2. Headless — captures screenshots for slideshow
    Returns combined result with step trace + screenshots.
    """
    test_case = {
        "title": payload.title,
        "steps": payload.steps,
        "expected_result": payload.expected_result,
        "type": "single"
    }

    # Run 1 — headful, user watches live
    headful_result = await run_test_case(
        test_case=test_case,
        base_url=payload.url,
        headful=True,
        capture_screenshots=False
    )

    # Run 2 — headless, capture screenshots
    headless_result = await run_test_case(
        test_case=test_case,
        base_url=payload.url,
        headful=False,
        capture_screenshots=True
    )

    # Combine — use headful result as source of truth for pass/fail
    # use headless result for screenshots
    return {
        "mode": "headful_single_with_screenshots",
        "title": headful_result["title"],
        "passed": headful_result["passed"],
        "type": headful_result.get("type"),
        "expected_result": headful_result["expected_result"],
        "total_steps": headful_result["total_steps"],
        "executed_steps": headful_result["executed_steps"],
        "step_results": headful_result["step_results"],
        "screenshots": headless_result.get("screenshots", [])
    }


@router.post("/suite")
async def execute_suite_direct(payload: DirectSuiteRequest):
    """SUITE RUN — headless + screenshots, direct payload, no run_id needed."""
    execution_results = []
    total_passed = 0
    total_failed = 0

    for tc in payload.test_cases:
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
            capture_screenshots=True
        )
        execution_results.append(result)
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
        "stopped_early": total_failed > 0,
        "results": execution_results
    }