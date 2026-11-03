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
