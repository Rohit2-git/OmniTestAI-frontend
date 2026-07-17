import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends  # type: ignore
from pydantic import BaseModel  # type: ignore
from typing import Optional
from app.database import db
from app.auth.middleware import get_current_user
from app.executors.playwright import scout_application
from app.routers.test_data import find_best_template, find_default_condition, get_condition_fields

router = APIRouter(prefix="/apps", tags=["scout"])


async def _resolve_login_fields(app_id: str) -> Optional[dict]:
    """Best-effort lookup of this app's login Test Data, reused for the scout's
    auth bootstrap. Tries the app's default Test Data Condition first (same
    source /tests/generate uses automatically), then falls back to keyword-
    matching a Test Data Template against a generic 'log in' scenario."""
    try:
        mode, source_id = await find_default_condition(app_id)
        if mode == "condition" and source_id:
            fields = await get_condition_fields(source_id)
            if fields:
                return fields
    except Exception as e:
        print(f"[Scout] default condition lookup failed: {e}")
    try:
        match = await find_best_template(
            app_id=app_id,
            title="Login",
            objective="Log in to the application with a valid username and password."
        )
        if match:
            return match["fields"]
    except Exception as e:
        print(f"[Scout] template lookup failed: {e}")
    return None


class ScoutRefreshRequest(BaseModel):
    page_limit: Optional[int] = None  # if provided, updates the app's stored crawl-depth config


def _serialize_profile(profile) -> dict:
    return {
        "status": profile.status,
        "errorMessage": profile.errorMessage,
        "pageLimit": profile.pageLimit,
        "pagesScanned": profile.pagesScanned,
        "totalElements": profile.totalElements,
        "workflows": json.loads(profile.workflows) if profile.workflows else [],
        "estimatedTestCases": profile.estimatedTestCases,
        "scoutDurationSec": profile.scoutDurationSec,
        "scoutedAt": profile.scoutedAt.isoformat() if profile.scoutedAt else None,
        "authAttempted": profile.authAttempted,
        "authSucceeded": profile.authSucceeded,
    }


async def _generated_count_for_app(app_id: str) -> int:
    """Total saved test cases for this app across all batches — the numerator
    the Coverage Index compares against the scouted estimate."""
    runs = await db.testrun.find_many(where={"appId": app_id})
    if not runs:
        return 0
    run_ids = [r.id for r in runs]
    count = await db.testresult.count(where={"runId": {"in": run_ids}})
    return count


async def _run_and_persist_scout(app_id: str, base_url: str, page_limit: int):
    login_fields = await _resolve_login_fields(app_id)
    try:
        result = await scout_application(base_url, page_limit, login_fields=login_fields)
        await db.appscoutprofile.upsert(
            where={"appId": app_id},
            data={
                "create": {
                    "appId": app_id,
                    "status": "ready",
                    "pageLimit": page_limit,
                    "pagesScanned": result["pagesScanned"],
                    "totalElements": result["totalElements"],
                    "workflows": json.dumps(result["workflows"]),
                    "estimatedTestCases": result["estimatedTestCases"],
                    "scoutDurationSec": result["scoutDurationSec"],
                    "authAttempted": result.get("authAttempted", False),
                    "authSucceeded": result.get("authSucceeded", False),
                    "scoutedAt": datetime.utcnow(),
                },
                "update": {
                    "status": "ready",
                    "errorMessage": None,
                    "pageLimit": page_limit,
                    "pagesScanned": result["pagesScanned"],
                    "totalElements": result["totalElements"],
                    "workflows": json.dumps(result["workflows"]),
                    "estimatedTestCases": result["estimatedTestCases"],
                    "scoutDurationSec": result["scoutDurationSec"],
                    "authAttempted": result.get("authAttempted", False),
                    "authSucceeded": result.get("authSucceeded", False),
                    "scoutedAt": datetime.utcnow(),
                },
            },
        )
    except Exception as e:
        await db.appscoutprofile.upsert(
            where={"appId": app_id},
            data={
                "create": {"appId": app_id, "status": "failed", "errorMessage": str(e), "pageLimit": page_limit},
                "update": {"status": "failed", "errorMessage": str(e)},
            },
        )
        raise


@router.get("/{app_id}/scout")
async def get_scout_profile(app_id: str, current_user=Depends(get_current_user)):
    """
    Returns the cached scout profile for this app, running a fresh crawl only
    if none exists yet (first-open-ever behavior). Always attaches the current
    generated-test-case count so the frontend can compute live coverage % even
    as new batches get saved after the scout ran.
    """
    app_record = await db.application.find_unique(where={"id": app_id})
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found.")
    if not app_record.url or app_record.url == "http://localhost":
        raise HTTPException(status_code=400, detail="This application has no reachable URL configured.")

    profile = await db.appscoutprofile.find_unique(where={"appId": app_id})

    if not profile:
        page_limit = 15
        try:
            await _run_and_persist_scout(app_id, app_record.url, page_limit)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Application scouting failed: {str(e)}")
        profile = await db.appscoutprofile.find_unique(where={"appId": app_id})

    generated = await _generated_count_for_app(app_id)
    out = _serialize_profile(profile)
    out["generatedTestCases"] = generated
    out["coveragePercent"] = (
        min(100, round((generated / out["estimatedTestCases"]) * 100)) if out["estimatedTestCases"] else 0
    )
    out["safeToGenerateMore"] = max(0, out["estimatedTestCases"] - generated)
    return out


@router.post("/{app_id}/scout/refresh")
async def refresh_scout_profile(app_id: str, payload: ScoutRefreshRequest, current_user=Depends(get_current_user)):
    """Force a fresh crawl. Optionally updates the stored page_limit config first."""
    app_record = await db.application.find_unique(where={"id": app_id})
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found.")
    if not app_record.url or app_record.url == "http://localhost":
        raise HTTPException(status_code=400, detail="This application has no reachable URL configured.")

    existing = await db.appscoutprofile.find_unique(where={"appId": app_id})
    page_limit = payload.page_limit or (existing.pageLimit if existing else 15)
    page_limit = max(1, min(page_limit, 100))  # sane hard ceiling regardless of what's posted

    try:
        await _run_and_persist_scout(app_id, app_record.url, page_limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Application scouting failed: {str(e)}")

    profile = await db.appscoutprofile.find_unique(where={"appId": app_id})
    generated = await _generated_count_for_app(app_id)
    out = _serialize_profile(profile)
    out["generatedTestCases"] = generated
    out["coveragePercent"] = (
        min(100, round((generated / out["estimatedTestCases"]) * 100)) if out["estimatedTestCases"] else 0
    )
    out["safeToGenerateMore"] = max(0, out["estimatedTestCases"] - generated)
    return out