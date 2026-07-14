from fastapi import APIRouter, Depends, HTTPException, Request, Response, status  # type: ignore
from pydantic import BaseModel, EmailStr  # type: ignore
from app.database import db
from app.auth.security import create_access_token, hash_password, verify_password
from app.auth.middleware import get_current_user, require_role, COOKIE_NAME
from app.rate_limiter import check_login_allowed, record_login_failure, record_login_success, RateLimitExceeded

router = APIRouter(prefix="/auth", tags=["auth"])

ALLOWED_ROLES = {"admin", "qa_engineer", "qa_reviewer", "developer"}

COOKIE_KWARGS = dict(
    httponly=True,
    samesite="lax",
    secure=False,
    max_age=60 * 60,
    path="/",
)


# --- Schemas -------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str

class AdminCreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "qa_reviewer"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateUserRequest(BaseModel):
    role: str | None = None
    isActive: bool | None = None
    name: str | None = None

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    isActive: bool

    class Config:
        from_attributes = True


# --- Public routes -------------------------------------------------------

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest):
    """Self-registration — always creates viewer accounts."""
    existing = await db.user.find_unique(where={"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await db.user.create(data={
        "email": payload.email,
        "passwordHash": hash_password(payload.password),
        "name": payload.name,
        "role": "qa_reviewer",  # self-registration defaults to qa_reviewer
    })
    return user

@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, response: Response, request: Request):
    ip = request.client.host if request.client else "unknown"

    # Check if this IP is locked out before touching the DB
    try:
        check_login_allowed(ip)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail=str(e),
            headers={"Retry-After": str(e.retry_after)},
        )

    user = await db.user.find_unique(where={"email": payload.email})
    if not user or not verify_password(payload.password, user.passwordHash):
        record_login_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.isActive:
        raise HTTPException(status_code=403, detail="Account is disabled")

    record_login_success(ip)
    token = create_access_token(user_id=user.id, email=user.email, role=user.role)
    response.set_cookie(key=COOKIE_NAME, value=token, **COOKIE_KWARGS)
    return user

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"detail": "Logged out"}

@router.get("/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return user


# --- Admin-only routes ---------------------------------------------------

@router.get("/users")
async def list_users(_=Depends(require_role("admin"))):
    """Admin only — list all users."""
    users = await db.user.find_many(order={"createdAt": "desc"})
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "isActive": u.isActive} for u in users]

@router.post("/admin/create-user", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def admin_create_user(payload: AdminCreateUserRequest, _=Depends(require_role("admin"))):
    """Admin only — create a user with any role."""
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role. Must be admin, qa_engineer, qa_reviewer, or developer")
    existing = await db.user.find_unique(where={"email": payload.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = await db.user.create(data={
        "email": payload.email,
        "passwordHash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
    })
    return user

@router.patch("/users/{user_id}")
async def update_user(user_id: int, payload: UpdateUserRequest, current_user=Depends(require_role("admin"))):
    """Admin only — update role or active status. Cannot modify own account."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot modify your own account here")
    if payload.role and payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    update_data = {k: v for k, v in payload.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    user = await db.user.update(where={"id": user_id}, data=update_data)
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "isActive": user.isActive}

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, current_user=Depends(require_role("admin"))):
    """Admin only — permanently delete a user and all their associated data."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    
    user = await db.user.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete all associated data first (role requests) before deleting the user
    await db.rolerequest.delete_many(where={"userId": user_id})
    
    # Delete the user record
    await db.user.delete(where={"id": user_id})
    
    return {"message": f"User {user.email} and all associated data permanently deleted"}

# --- Role Request routes -------------------------------------------------

class RoleRequestCreate(BaseModel):
    requestedRole: str = "tester"
    reason: str

@router.post("/role-request", status_code=status.HTTP_201_CREATED)
async def create_role_request(payload: RoleRequestCreate, current_user=Depends(get_current_user)):
    """Any viewer can submit a role upgrade request."""
    if current_user.role not in ("qa_reviewer", "developer"):
        raise HTTPException(status_code=400, detail="Only QA Reviewers and Developers can request a role upgrade")
    if payload.requestedRole not in ("qa_engineer", "developer"):
        raise HTTPException(status_code=400, detail="Only qa_engineer or developer roles can be requested")
    if not payload.reason or len(payload.reason.strip()) < 10:
        raise HTTPException(status_code=400, detail="Please provide a reason (at least 10 characters)")

    # Check if there's already a pending request from this user
    existing = await db.rolerequest.find_first(
        where={"userId": current_user.id, "status": "pending"}
    )
    if existing:
        raise HTTPException(status_code=409, detail="You already have a pending request")

    req = await db.rolerequest.create(data={
        "userId": current_user.id,
        "requestedRole": payload.requestedRole,
        "reason": payload.reason.strip(),
        "status": "pending"
    })
    return {"id": req.id, "status": req.status, "requestedRole": req.requestedRole}

@router.get("/role-request/mine")
async def get_my_requests(current_user=Depends(get_current_user)):
    """Get the current user's role request history."""
    requests = await db.rolerequest.find_many(
        where={"userId": current_user.id},
        order={"createdAt": "desc"}
    )
    return [{"id": r.id, "requestedRole": r.requestedRole, "reason": r.reason,
             "status": r.status, "reviewNote": r.reviewNote, "createdAt": str(r.createdAt)} for r in requests]

@router.get("/role-requests")
async def list_role_requests(status_filter: str = "pending", _=Depends(require_role("admin"))):
    """Admin only — list all role requests, filterable by status."""
    where = {} if status_filter == "all" else {"status": status_filter}
    requests = await db.rolerequest.find_many(
        where=where,
        include={"user": True},
        order={"createdAt": "desc"}
    )
    return [{
        "id": r.id,
        "userId": r.userId,
        "userName": r.user.name,
        "userEmail": r.user.email,
        "requestedRole": r.requestedRole,
        "reason": r.reason,
        "status": r.status,
        "reviewNote": r.reviewNote,
        "createdAt": str(r.createdAt)
    } for r in requests]

class ReviewRoleRequest(BaseModel):
    action: str  # "approve" | "reject"
    reviewNote: str | None = None

@router.patch("/role-requests/{request_id}")
async def review_role_request(request_id: int, payload: ReviewRoleRequest, current_user=Depends(require_role("admin"))):
    """Admin only — approve or reject a role request."""
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    req = await db.rolerequest.find_unique(where={"id": request_id}, include={"user": True})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already reviewed")

    new_status = "approved" if payload.action == "approve" else "rejected"

    # Update the request status
    await db.rolerequest.update(
        where={"id": request_id},
        data={
            "status": new_status,
            "reviewedBy": current_user.id,
            "reviewNote": payload.reviewNote or ""
        }
    )

    # If approved, actually update the user's role
    if payload.action == "approve":
        await db.user.update(
            where={"id": req.userId},
            data={"role": req.requestedRole}
        )

    return {"id": request_id, "status": new_status, "message": f"Request {new_status}"}

# --- Application routes (DB-backed) -------------------------------------

class AppCreateRequest(BaseModel):
    id: str
    name: str
    description: str = ""
    platform: str = "web"
    url: str = "http://localhost"
    status: str = "active"

@router.post("/apps", status_code=status.HTTP_201_CREATED)
async def create_app(payload: AppCreateRequest, current_user=Depends(get_current_user)):
    """Admin, QA Engineer, Developer — register an app in the DB. QA Reviewer is read-only and cannot create apps."""
    if current_user.role == "qa_reviewer":
        raise HTTPException(status_code=403, detail="QA Reviewers cannot create applications")
    existing = await db.application.find_unique(where={"id": payload.id})
    if existing:
        return existing  # idempotent
    app = await db.application.create(data={
        "id": payload.id,
        "name": payload.name,
        "description": payload.description,
        "platform": payload.platform,
        "url": payload.url,
        "status": payload.status
    })
    return app

@router.get("/apps")
async def list_apps(current_user=Depends(get_current_user)):
    """All roles — returns apps scoped to the user's access. Only qa_reviewer
    is restricted; admin, qa_engineer, and developer all see every app."""
    if current_user.role == "qa_reviewer":
        # Only return assigned apps
        access = await db.userappaccess.find_many(
            where={"userId": current_user.id},
            include={"app": True}
        )
        return [a.app for a in access if a.app]
    else:
        return await db.application.find_many(order={"createdAt": "desc"})

@router.get("/reviewers")
async def list_reviewers(_=Depends(require_role("admin", "qa_engineer"))):
    """Admin or QA Engineer — list QA Reviewer accounts only. Exists separately
    from /auth/users (admin-only) because qa_engineer needs this narrower list
    to manage app access without seeing every user's role/account details."""
    reviewers = await db.user.find_many(where={"role": "qa_reviewer"}, order={"name": "asc"})
    return [{"id": u.id, "email": u.email, "name": u.name, "isActive": u.isActive} for u in reviewers]

@router.delete("/apps/{app_id}")
async def delete_app(app_id: str, _=Depends(require_role("admin"))):
    """Admin only — delete app and all its access assignments."""
    await db.userappaccess.delete_many(where={"appId": app_id})
    await db.application.delete(where={"id": app_id})
    return {"message": f"App {app_id} deleted"}

# --- App access assignment (admin only) ---------------------------------

@router.get("/users/{user_id}/apps")
async def get_user_apps(user_id: int, _=Depends(require_role("admin", "qa_engineer"))):
    """Admin or QA Engineer — get apps assigned to a user."""
    access = await db.userappaccess.find_many(
        where={"userId": user_id},
        include={"app": True}
    )
    return [{"appId": a.appId, "appName": a.app.name if a.app else ""} for a in access]

class AppAssignRequest(BaseModel):
    appIds: list[str]

@router.put("/users/{user_id}/apps")
async def set_user_apps(user_id: int, payload: AppAssignRequest, current_user=Depends(require_role("admin", "qa_engineer"))):
    """Admin or QA Engineer — replace all app assignments for a user.
    This is the one privilege that makes qa_engineer more than a developer:
    deciding which apps a qa_reviewer is allowed to see."""
    user = await db.user.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != "qa_reviewer":
        raise HTTPException(status_code=400, detail="App access assignment only applies to QA Reviewer accounts")
    
    # Delete existing assignments
    await db.userappaccess.delete_many(where={"userId": user_id})
    
    # Create new ones
    for app_id in payload.appIds:
        app = await db.application.find_unique(where={"id": app_id})
        if app:
            await db.userappaccess.create(data={"userId": user_id, "appId": app_id})
    
    return {"message": f"Apps assigned to user {user_id}", "appIds": payload.appIds}