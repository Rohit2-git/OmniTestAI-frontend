"""
FastAPI dependencies for authentication + role enforcement.

Usage in a router:

    from app.auth.middleware import get_current_user, require_role

    @router.get("/secret")
    async def secret(user = Depends(get_current_user)):
        ...

    @router.post("/admin-only")
    async def admin_only(user = Depends(require_role("admin"))):
        ...

    @router.post("/generate")
    async def generate(user = Depends(require_role("admin", "tester"))):
        ...
"""
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, status  # type: ignore

from app.auth.security import decode_access_token
from app.database import db

COOKIE_NAME = "access_token"


async def get_current_user(access_token: Optional[str] = Cookie(None, alias=COOKIE_NAME)):
    """
    Reads the JWT from the httpOnly cookie, verifies it, and loads the
    corresponding user from the database. Raises 401 if missing/invalid.
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_access_token(access_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = await db.user.find_unique(where={"id": int(user_id)})
    if user is None or not user.isActive:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


def require_role(*allowed_roles: str):
    """
    Dependency factory. Use as Depends(require_role("admin")) or
    Depends(require_role("admin", "tester")) to allow multiple roles.
    """

    async def role_checker(user=Depends(get_current_user)):
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return user

    return role_checker