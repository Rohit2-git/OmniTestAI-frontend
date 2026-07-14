"""
rate_limiter.py — Central in-memory rate limiting for OmniTestAI.

All limits are configured here in one place. Swap the store for Redis
later without touching any router — just replace RateLimitStore.

Limits:
  Login failures   : 5 attempts  / 15-min lockout  (keyed by IP)
  Test generation  : 5 requests  / 10 minutes       (keyed by user_id)
  Single execution : 10 runs     / 1 hour           (keyed by user_id)
  Suite execution  : 5 runs      / 1 hour           (keyed by user_id)
  NL execution     : 10 runs     / 1 hour           (keyed by user_id)
  Concurrent runs  : 2 at once                      (keyed by user_id)
"""

import time
import threading
from collections import defaultdict, deque
from typing import Tuple

# ── Configuration ────────────────────────────────────────────────────────────

LOGIN_MAX_ATTEMPTS  = 5
LOGIN_LOCKOUT_SECS  = 15 * 60          # 15 minutes

GENERATION_MAX      = 5
GENERATION_WINDOW   = 10 * 60          # 10 minutes

SINGLE_EXEC_MAX     = 10
SINGLE_EXEC_WINDOW  = 60 * 60          # 1 hour

SUITE_EXEC_MAX      = 5
SUITE_EXEC_WINDOW   = 60 * 60          # 1 hour

NL_EXEC_MAX         = 10
NL_EXEC_WINDOW      = 60 * 60          # 1 hour

MAX_CONCURRENT      = 2                # max parallel execution runs per user

# ── Thread-safe in-memory store ──────────────────────────────────────────────

_lock = threading.Lock()

# Login: ip → (fail_count, lockout_until_ts)
_login_state: dict[str, tuple[int, float]] = {}

# Sliding-window: (namespace, key) → deque of timestamps
_windows: dict[tuple, deque] = defaultdict(deque)

# Concurrent: user_id → active count
_concurrent: dict[int, int] = defaultdict(int)


# ── Internal helpers ─────────────────────────────────────────────────────────

def _sliding_check(ns: str, key: str, max_hits: int, window_secs: int) -> Tuple[bool, int]:
    """
    Returns (allowed, seconds_until_reset).
    Prunes expired timestamps, then checks if we're under the limit.
    Does NOT record the new hit — call _sliding_record() on success.
    """
    now = time.monotonic()
    bucket = _windows[(ns, key)]
    while bucket and now - bucket[0] > window_secs:
        bucket.popleft()
    if len(bucket) >= max_hits:
        wait = int(window_secs - (now - bucket[0])) + 1
        return False, wait
    return True, 0


def _sliding_record(ns: str, key: str) -> None:
    _windows[(ns, key)].append(time.monotonic())


# ── Public API ───────────────────────────────────────────────────────────────

class RateLimitExceeded(Exception):
    """Raised when a rate limit is hit. Carry retry_after seconds."""
    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


# -- Login --

def check_login_allowed(ip: str) -> None:
    """
    Call before validating credentials.
    Raises RateLimitExceeded if the IP is locked out.
    """
    with _lock:
        state = _login_state.get(ip)
        if state:
            fails, locked_until = state
            if locked_until > time.monotonic():
                wait = int(locked_until - time.monotonic()) + 1
                raise RateLimitExceeded(
                    f"Too many failed login attempts. Try again in {_fmt(wait)}.",
                    retry_after=wait,
                )


def record_login_failure(ip: str) -> None:
    """Call after a failed login attempt."""
    with _lock:
        state = _login_state.get(ip, (0, 0.0))
        fails = state[0] + 1
        locked_until = (time.monotonic() + LOGIN_LOCKOUT_SECS) if fails >= LOGIN_MAX_ATTEMPTS else 0.0
        _login_state[ip] = (fails, locked_until)


def record_login_success(ip: str) -> None:
    """Call after a successful login — resets the counter."""
    with _lock:
        _login_state.pop(ip, None)


# -- Generation --

def check_generation(user_id: int) -> None:
    with _lock:
        allowed, wait = _sliding_check("gen", str(user_id), GENERATION_MAX, GENERATION_WINDOW)
        if not allowed:
            raise RateLimitExceeded(
                f"Generation limit reached ({GENERATION_MAX} per 10 min). "
                f"Try again in {_fmt(wait)}.",
                retry_after=wait,
            )
        _sliding_record("gen", str(user_id))


# -- Execution --

def check_single_execution(user_id: int) -> None:
    with _lock:
        _check_concurrent(user_id)
        allowed, wait = _sliding_check("single", str(user_id), SINGLE_EXEC_MAX, SINGLE_EXEC_WINDOW)
        if not allowed:
            raise RateLimitExceeded(
                f"Single execution limit reached ({SINGLE_EXEC_MAX}/hr). "
                f"Try again in {_fmt(wait)}.",
                retry_after=wait,
            )
        _sliding_record("single", str(user_id))
        _concurrent[user_id] += 1


def check_suite_execution(user_id: int) -> None:
    with _lock:
        _check_concurrent(user_id)
        allowed, wait = _sliding_check("suite", str(user_id), SUITE_EXEC_MAX, SUITE_EXEC_WINDOW)
        if not allowed:
            raise RateLimitExceeded(
                f"Suite execution limit reached ({SUITE_EXEC_MAX}/hr). "
                f"Try again in {_fmt(wait)}.",
                retry_after=wait,
            )
        _sliding_record("suite", str(user_id))
        _concurrent[user_id] += 1


def check_nl_execution(user_id: int) -> None:
    with _lock:
        _check_concurrent(user_id)
        allowed, wait = _sliding_check("nl", str(user_id), NL_EXEC_MAX, NL_EXEC_WINDOW)
        if not allowed:
            raise RateLimitExceeded(
                f"NL execution limit reached ({NL_EXEC_MAX}/hr). "
                f"Try again in {_fmt(wait)}.",
                retry_after=wait,
            )
        _sliding_record("nl", str(user_id))
        _concurrent[user_id] += 1


def release_execution(user_id: int) -> None:
    """Call in a finally block after any execution completes or errors."""
    with _lock:
        if _concurrent[user_id] > 0:
            _concurrent[user_id] -= 1


def _check_concurrent(user_id: int) -> None:
    """Must be called while _lock is held."""
    if _concurrent[user_id] >= MAX_CONCURRENT:
        raise RateLimitExceeded(
            f"You already have {MAX_CONCURRENT} executions running. "
            f"Wait for one to finish before starting another.",
            retry_after=30,
        )


# ── Formatting helper ─────────────────────────────────────────────────────────

def _fmt(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    m, s = divmod(seconds, 60)
    return f"{m}m {s}s" if s else f"{m}m"