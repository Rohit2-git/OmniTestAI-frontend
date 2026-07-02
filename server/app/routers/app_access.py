"""
App Access Router — manages which apps a QA Reviewer can see.

Grant/revoke is restricted to qa_engineer and admin — this is the one
privilege that distinguishes qa_engineer from developer (both can
generate/execute/do everything operational; only qa_engineer decides
who else gets visibility into which app).
"""
from fastapi import APIRouter, Depends, HTTPException, status  # type: ignore
from pydantic import BaseModel  # type: ignore
from typing import List

from app.database import db
from app.auth.middleware import get_current_user, require_role

router = APIRouter(prefix="/app-access", tags=["app-access"])

# Roles allowed to manage app access grants.
CAN_MANAGE_ACCESS = ("admin", "qa_engineer")


class GrantAccessRequest(BaseModel):
    userId: int
    appId: str


class AccessGrantOut(BaseModel):
    id: int
    userId: int
    appId: str

    class Config:
        from_attributes = True


@router.get("/reviewers")
async def list_reviewers(_=Depends(require_role(*CAN_MANAGE_ACCESS))):
    """List all qa_reviewer users — the only role app-access actually restricts."""
    reviewers = await db.user.find_many(where={"role": "qa_reviewer"}, order={"name": "asc"})
    return [{"id": u.id, "name": u.name, "email": u.email} for u in reviewers]


@router.get("/grants")
async def list_grants(_=Depends(require_role(*CAN_MANAGE_ACCESS))):
    """List every existing user-to-app access grant, with app/user names joined in."""
    grants = await db.userappaccess.find_many(
        include={"user": True, "app": True},
        order={"createdAt": "desc"},
    )
    return [
        {
            "id": g.id,
            "userId": g.userId,
            "userName": g.user.name,
            "userEmail": g.user.email,
            "appId": g.appId,
            "appName": g.app.name,
            "createdAt": str(g.createdAt),
        }
        for g in grants
    ]


@router.get("/mine")
async def my_app_access(user=Depends(get_current_user)):
    """
    The current user's own accessible app IDs. For unrestricted roles
    (admin, qa_engineer, developer) this returns null to mean "all apps" —
    only qa_reviewer gets a real restricted list back.
    """
    if user.role != "qa_reviewer":
        return {"restricted": False, "appIds": None}

    grants = await db.userappaccess.find_many(where={"userId": user.id})
    return {"restricted": True, "appIds": [g.appId for g in grants]}


@router.post("/grant", response_model=AccessGrantOut, status_code=status.HTTP_201_CREATED)
async def grant_access(payload: GrantAccessRequest, current_user=Depends(require_role(*CAN_MANAGE_ACCESS))):
    """Grant a user access to a specific app. Only meaningful for qa_reviewer users,
    but we don't hard-block granting to other roles — it's a harmless no-op for them
    since unrestricted roles ignore UserAppAccess entirely."""
    target_user = await db.user.find_unique(where={"id": payload.userId})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    app = await db.application.find_unique(where={"id": payload.appId})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    existing = await db.userappaccess.find_first(
        where={"userId": payload.userId, "appId": payload.appId}
    )
    if existing:
        raise HTTPException(status_code=409, detail="This user already has access to this app")

    grant = await db.userappaccess.create(data={"userId": payload.userId, "appId": payload.appId})
    return grant


@router.delete("/grant/{grant_id}")
async def revoke_access(grant_id: int, _=Depends(require_role(*CAN_MANAGE_ACCESS))):
    """Revoke a specific access grant by its id."""
    grant = await db.userappaccess.find_unique(where={"id": grant_id})
    if not grant:
        raise HTTPException(status_code=404, detail="Access grant not found")

    await db.userappaccess.delete(where={"id": grant_id})
    return {"message": "Access revoked"}