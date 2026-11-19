from fastapi import APIRouter, Depends

from app.api.deps import require_operations_reviews_access
from app.models import User
from app.services.enterprise_bridge import (
    EnterpriseBridgeError,
    call_enterprise_json,
    enterprise_bridge_http_exception,
)

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


@router.get("/playstore/status", summary="Google Play Store ingestion collector status")
def playstore_ingestion_status(_: User = Depends(require_operations_reviews_access)) -> dict:
    try:
        return call_enterprise_json("GET", "/api/ingestion/playstore/status", timeout=30)
    except EnterpriseBridgeError as error:
        raise enterprise_bridge_http_exception(error) from error


@router.post("/playstore/trigger", summary="Run Google Play Store review sync now")
def playstore_ingestion_trigger(_: User = Depends(require_operations_reviews_access)) -> dict:
    try:
        return call_enterprise_json("POST", "/api/ingestion/playstore/trigger", payload={})
    except EnterpriseBridgeError as error:
        raise enterprise_bridge_http_exception(error) from error