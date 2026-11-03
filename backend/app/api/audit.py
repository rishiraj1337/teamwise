from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_operations_reviews_access
from app.db.review_session import get_review_engine
from app.db.session import get_db
from app.models import User
from app.schemas.audit import AuditLogListResponse
from app.services.audit import list_merged_audit_logs

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List audit log entries (Teamwise + enterprise review platform)",
)
def get_audit_logs(
    _: User = Depends(require_operations_reviews_access),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None, max_length=100),
    resource_type: str | None = Query(default=None, max_length=100),
    resource: str | None = Query(default=None, max_length=100),
    search: str | None = Query(default=None, max_length=200),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
) -> AuditLogListResponse:
    resource_filter = resource_type or resource
    try:
        review_engine = get_review_engine()
    except Exception:
        # Teamwise audit data must remain available if enterprise review DB setup fails.
        review_engine = None

    rows, total = list_merged_audit_logs(
        db,
        review_engine,
        limit=limit,
        offset=offset,
        action=action,
        resource_type=resource_filter,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )
    return AuditLogListResponse(
        items=rows,
        total=total,
        limit=limit,
        offset=offset,
    )
