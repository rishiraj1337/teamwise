"""Failed login tracking and temporary account lockout."""

from collections import deque
from threading import Lock
from time import time

from fastapi import HTTPException, status

_lock = Lock()
_failures: dict[str, deque[float]] = {}
_locked_until: dict[str, float] = {}


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def assert_login_allowed(email: str) -> None:
    key = _normalize_email(email)
    now = time()
    with _lock:
        locked_until = _locked_until.get(key)
        if locked_until is not None and locked_until > now:
            remaining_seconds = int(locked_until - now)
            remaining_minutes = max(1, (remaining_seconds + 59) // 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed sign-in attempts. Try again in about {remaining_minutes} minute(s).",
            )
        if locked_until is not None and locked_until <= now:
            _locked_until.pop(key, None)
            _failures.pop(key, None)


def record_failed_login(email: str, *, max_failures: int, window_seconds: int, lockout_seconds: int) -> None:
    key = _normalize_email(email)
    now = time()
    with _lock:
        bucket = _failures.setdefault(key, deque())
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        bucket.append(now)
        if len(bucket) >= max_failures:
            _locked_until[key] = now + lockout_seconds
            bucket.clear()


def clear_login_lockout(email: str) -> None:
    key = _normalize_email(email)
    with _lock:
        _failures.pop(key, None)
        _locked_until.pop(key, None)
