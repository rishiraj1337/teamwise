from fastapi import Request


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def rate_limit_key(scope: str, *parts: str) -> str:
    normalized = ":".join(part.strip().lower() for part in parts if part.strip())
    return f"{scope}:{normalized}" if normalized else scope
