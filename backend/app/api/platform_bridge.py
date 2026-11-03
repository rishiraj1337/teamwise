from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_operations_reviews_access
from app.models import User
from app.services.enterprise_bridge import (
    EnterpriseBridgeError,
    enterprise_bridge_http_exception,
    fetch_enterprise_access_token,
)

router = APIRouter(prefix="/platform", tags=["platform-bridge"])


@router.get(
    "/access-token",
    summary="Issue a short-lived enterprise platform JWT for Operations UI features",
)
def get_platform_access_token(
    _: User = Depends(require_operations_reviews_access),
) -> dict[str, str]:
    try:
        token = fetch_enterprise_access_token()
    except EnterpriseBridgeError as error:
        raise enterprise_bridge_http_exception(error) from error
    return {"token": token}
