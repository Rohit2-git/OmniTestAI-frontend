"""
Password hashing + JWT helpers — no passlib, no pyjwt.
Only requires: pip install bcrypt

Environment variables (add to your .env):
    JWT_SECRET_KEY=<a long random string>
    JWT_EXPIRE_MINUTES=60   # optional, defaults to 60
"""
import os
import json
import hmac
import base64
import hashlib
import time
from typing import Optional

import bcrypt  # type: ignore

# --- Password hashing (direct bcrypt, no passlib) ----------------------

def hash_password(plain_password: str) -> str:
    """Hash a password using bcrypt directly."""
    # bcrypt has a 72-byte limit — truncate explicitly rather than let it error
    password_bytes = plain_password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a password against its bcrypt hash."""
    password_bytes = plain_password.encode("utf-8")[:72]
    return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))


# --- JWT (stdlib only, no pyjwt) ---------------------------------------

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Add it to your .env file:\n"
        "JWT_SECRET_KEY=some-long-random-secret"
    )

JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def create_access_token(user_id: int, email: str, role: str) -> str:
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": int(time.time()) + JWT_EXPIRE_MINUTES * 60,
        "iat": int(time.time()),
    }
    body = _b64encode(json.dumps(payload).encode())
    sig = hmac.new(
        JWT_SECRET_KEY.encode(),
        f"{header}.{body}".encode(),
        hashlib.sha256
    ).digest()
    return f"{header}.{body}.{_b64encode(sig)}"


def decode_access_token(token: str) -> Optional[dict]:
    try:
        header, body, sig = token.split(".")
        expected = hmac.new(
            JWT_SECRET_KEY.encode(),
            f"{header}.{body}".encode(),
            hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64decode(sig), expected):
            return None
        payload = json.loads(_b64decode(body))
        if payload.get("exp", 0) < time.time():
            return None  # expired
        return payload
    except Exception:
        return None