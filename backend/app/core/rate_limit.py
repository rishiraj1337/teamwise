"""Simple in-process rate limiting for auth endpoints (single API worker).

For multi-instance production, also enforce limits at the load balancer or API gateway.
"""

from collections import deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, status

_lock = Lock()
_events: dict[str, deque[float]] = {}


def enforce_rate_limit(key: str, *, max_events: int, window_seconds: int = 60) -> None:
    if max_events <= 0:
        return

    now = monotonic()
    with _lock:
        bucket = _events.setdefault(key, deque())
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= max_events:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait a minute and try again.",
            )
        bucket.append(now)
