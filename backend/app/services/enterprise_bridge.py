import json
import ssl
import urllib.error
import urllib.request

from fastapi import HTTPException, status

from app.core.config import get_settings


class EnterpriseBridgeError(Exception):
    pass


def fetch_enterprise_access_token() -> str:
    settings = get_settings()
    if not settings.enterprise_bridge_configured:
        raise EnterpriseBridgeError(
            "Enterprise bridge is not configured. Set ENTERPRISE_BRIDGE_EMAIL and ENTERPRISE_BRIDGE_PASSWORD."
        )

    payload = json.dumps(
        {
            "email": settings.enterprise_bridge_email,
            "password": settings.enterprise_bridge_password.get_secret_value(),  # type: ignore[union-attr]
        }
    ).encode("utf-8")
    url = f"{settings.enterprise_api_url.rstrip('/')}/api/auth/login"
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, context=context, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise EnterpriseBridgeError(f"Enterprise login failed ({error.code}): {detail[:300]}") from error
    except urllib.error.URLError as error:
        raise EnterpriseBridgeError(f"Could not reach enterprise API at {url}: {error.reason}") from error

    token = body.get("token")
    if not isinstance(token, str) or not token.strip():
        raise EnterpriseBridgeError("Enterprise login did not return a token.")
    return token.strip()


def enterprise_bridge_http_exception(error: EnterpriseBridgeError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=str(error),
    )


def call_enterprise_json(
    method: str,
    path: str,
    *,
    payload: dict | None = None,
    timeout: float = 120.0,
) -> dict:
    settings = get_settings()
    token = fetch_enterprise_access_token()
    base = settings.enterprise_api_url.rstrip("/")
    if not path.startswith("/"):
        path = f"/{path}"
    body = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"{base}{path}",
        data=body,
        method=method.upper(),
        headers=headers,
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, context=context, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            if not raw.strip():
                return {}
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {"result": parsed}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise EnterpriseBridgeError(f"Enterprise API {method} {path} failed ({error.code}): {detail[:400]}") from error
    except urllib.error.URLError as error:
        raise EnterpriseBridgeError(f"Could not reach enterprise API at {base}{path}: {error.reason}") from error
