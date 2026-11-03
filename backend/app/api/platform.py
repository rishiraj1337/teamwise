from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth_rate_limit import client_ip, rate_limit_key
from app.api.platform_deps import (
    require_platform_audit_read,
    require_platform_authenticated,
    require_platform_reviews_export,
    require_platform_reviews_read,
    require_platform_reviews_write,
)
from app.core.config import get_settings
from app.core.login_lockout import assert_login_allowed, clear_login_lockout, record_failed_login
from app.core.rate_limit import enforce_rate_limit
from app.core.security import create_access_token, verify_password
from app.db.review_session import get_review_db
from app.db.session import get_db
from app.models import User
from app.models.review import PlayStoreReview
from app.schemas.platform import (
    PlatformAuditLogEntry,
    PlatformAuditLogResponse,
    PlatformLoginRequest,
    PlatformLoginResponse,
    PlatformMeResponse,
    PlatformReviewListResponse,
    PlatformReviewPut,
    PlatformReviewStatsResponse,
    PlatformReviewSummary,
    PlatformReviewUpdateResponse,
    merge_platform_put,
)
from app.schemas.review import ReviewPublic
from app.schemas.user import UserLogin
from app.services.audit import list_audit_logs, record_audit
from app.services.platform_identity import platform_user_payload
from app.services.review_export import reviews_to_csv_rows, reviews_to_json_export
from app.services.reviews import (
    fetch_reviews_for_export,
    list_reviews,
    review_platform_stats,
    update_review,
)

router = APIRouter()


def _platform_rate_limit(request: Request, scope: str) -> None:
    settings = get_settings()
    enforce_rate_limit(
        rate_limit_key(scope, client_ip(request), "platform"),
        max_events=settings.auth_rate_limit_per_minute if scope == "auth" else 300,
    )


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "code": "VALIDATION_ERROR",
                "message": "Invalid date format; use ISO 8601",
                "details": str(error),
            },
        ) from error
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _review_summary_from_public(item: ReviewPublic) -> PlatformReviewSummary:
    return PlatformReviewSummary(
        unique_id=item.unique_id,
        channel=item.channel,
        star_ratings=item.star_ratings,
        review_text=item.review_text,
        category=item.category,
        subcategory=item.subcategory,
        priority=item.priority,
        status=item.status,
        resolution=item.resolution,
        department=item.department,
        review_timestamp=item.review_timestamp,
        created_at=item.created_at,
        updated_at=item.updated_at,
        response_timestamp=item.response_timestamp,
        developer_reply_text=item.developer_reply_text or None,
        developer_reply_time=item.developer_reply_time,
        review_link=item.review_link or None,
    )


@router.post("/auth/login", response_model=PlatformLoginResponse, summary="Spec-compatible login")
def platform_login(
    payload: PlatformLoginRequest, request: Request, db: Session = Depends(get_db)
) -> PlatformLoginResponse:
    _platform_rate_limit(request, "auth")
    login_payload = UserLogin(email=payload.email, password=payload.password)
    try:
        assert_login_allowed(str(login_payload.email))
    except HTTPException as lockout:
        record_audit(
            db,
            action="auth.login.lockout",
            resource_type="user",
            summary=f"Sign-in blocked for {login_payload.email}",
            actor_email=str(login_payload.email),
            metadata={"detail": str(lockout.detail)},
            request=request,
        )
        raise HTTPException(
            status_code=lockout.status_code,
            detail={
                "success": False,
                "code": "AUTHENTICATION_ERROR",
                "message": str(lockout.detail),
                "details": None,
            },
        ) from lockout

    settings = get_settings()
    user = db.scalar(select(User).where(User.email == login_payload.email))
    if user is None or not verify_password(login_payload.password, user.password):
        record_failed_login(
            str(login_payload.email),
            max_failures=settings.login_max_failures,
            window_seconds=settings.login_failure_window_minutes * 60,
            lockout_seconds=settings.login_lockout_minutes * 60,
        )
        record_audit(
            db,
            action="auth.login.failure",
            resource_type="user",
            summary=f"Failed sign-in for {login_payload.email}",
            actor_email=str(login_payload.email),
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "code": "AUTHENTICATION_ERROR",
                "message": "Invalid email or password",
                "details": None,
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    clear_login_lockout(str(login_payload.email))
    record_audit(
        db,
        action="auth.login.success",
        resource_type="user",
        resource_id=user.emp_id,
        summary=f"Signed in {user.email}",
        actor=user,
        request=request,
    )
    return PlatformLoginResponse(
        token=create_access_token(user.emp_id),
        user=platform_user_payload(db, user),
    )


@router.get("/auth/me", response_model=PlatformMeResponse, summary="Spec-compatible profile")
def platform_me(
    current_user: User = Depends(require_platform_authenticated),
    db: Session = Depends(get_db),
) -> PlatformMeResponse:
    return PlatformMeResponse(user=platform_user_payload(db, current_user))


@router.get("/reviews", response_model=PlatformReviewListResponse, summary="Unified review list")
def platform_list_reviews(
    _: User = Depends(require_platform_reviews_read),
    review_db: Session = Depends(get_review_db),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    channel: str | None = Query(default=None, max_length=100),
    starRating: int | None = Query(default=None, ge=1, le=5),
    category: str | None = Query(default=None, max_length=100),
    search: str | None = Query(default=None, max_length=200),
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    sortBy: str | None = Query(default=None, max_length=50),
    sortOrder: str | None = Query(default=None, max_length=10),
    priority: str | None = Query(default=None, max_length=50),
    status: str | None = Query(default=None, max_length=50),
) -> PlatformReviewListResponse:
    offset = (page - 1) * limit
    result = list_reviews(
        review_db,
        limit=limit,
        offset=offset,
        search=search,
        category=category,
        priority=priority,
        status=status,
        min_rating=starRating,
        max_rating=starRating,
        channel=channel,
        start_date=_parse_iso_datetime(startDate),
        end_date=_parse_iso_datetime(endDate),
        sort_by=sortBy,
        sort_order=sortOrder,
    )
    total_pages = max(1, (result.total + limit - 1) // limit) if result.total else 1
    return PlatformReviewListResponse(
        reviews=[_review_summary_from_public(item) for item in result.items],
        total=result.total,
        page=page,
        limit=limit,
        totalPages=total_pages,
    )


@router.get("/reviews/stats", response_model=PlatformReviewStatsResponse, summary="Cross-channel KPIs")
def platform_review_stats(
    _: User = Depends(require_platform_reviews_read),
    review_db: Session = Depends(get_review_db),
) -> PlatformReviewStatsResponse:
    return PlatformReviewStatsResponse(stats=review_platform_stats(review_db))


@router.get("/reviews/export", summary="Export recent reviews as JSON or CSV")
def platform_review_export(
    request: Request,
    current_user: User = Depends(require_platform_reviews_export),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
    format: str = Query(default="json", pattern="^(json|csv)$"),
    search: str | None = Query(default=None, max_length=200),
    category: str | None = Query(default=None, max_length=100),
    priority: str | None = Query(default=None, max_length=50),
    status: str | None = Query(default=None, max_length=50),
    min_star_rating: int | None = Query(default=None, alias="minStarRating", ge=1, le=5),
    max_star_rating: int | None = Query(default=None, alias="maxStarRating", ge=1, le=5),
    star_rating: int | None = Query(default=None, alias="starRating", ge=1, le=5),
    channel: str | None = Query(default=None, max_length=100),
    start_date: str | None = Query(default=None, alias="startDate"),
    end_date: str | None = Query(default=None, alias="endDate"),
) -> Response:
    start_dt = _parse_iso_datetime(start_date)
    end_dt = _parse_iso_datetime(end_date)
    if end_dt is not None and len((end_date or "").strip()) == 10:
        end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
    if star_rating is not None:
        min_star_rating = max_star_rating = star_rating
    rows = fetch_reviews_for_export(
        review_db,
        search=search,
        category=category,
        priority=priority,
        status=status,
        min_rating=min_star_rating,
        max_rating=max_star_rating,
        channel=channel,
        start_date=start_dt,
        end_date=end_dt,
    )
    record_audit(
        db,
        action="review.export_csv" if format == "csv" else "review.export_json",
        resource_type="review",
        summary=f"Exported {len(rows)} review(s) via platform API ({format})",
        actor=current_user,
        metadata={
            "row_count": len(rows),
            "format": format,
            "filters": {
                "search": search,
                "category": category,
                "priority": priority,
                "status": status,
                "min_rating": min_star_rating,
                "max_rating": max_star_rating,
                "channel": channel,
                "start_date": start_date,
                "end_date": end_date,
            },
        },
        request=request,
    )
    if format == "csv":
        body = reviews_to_csv_rows(rows)
        return Response(
            content=body,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="reviews-export.csv"'},
        )
    return Response(
        content=reviews_to_json_export(rows),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="reviews-export.json"'},
    )


@router.put("/reviews/{unique_id}", response_model=PlatformReviewUpdateResponse, summary="Update triage fields")
def platform_update_review(
    unique_id: str,
    payload: PlatformReviewPut,
    request: Request,
    current_user: User = Depends(require_platform_reviews_write),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
) -> PlatformReviewUpdateResponse:
    review = review_db.get(PlayStoreReview, unique_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "code": "NOT_FOUND",
                "message": "Review not found.",
                "details": None,
            },
        )
    merged = merge_platform_put(review, payload)
    try:
        updated, before, after = update_review(review_db, unique_id, merged)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "code": "VALIDATION_ERROR",
                "message": str(error),
                "details": None,
            },
        ) from error

    record_audit(
        db,
        action="review.update",
        resource_type="review",
        resource_id=unique_id,
        summary=f"Updated review {unique_id}",
        actor=current_user,
        metadata={"before": before, "after": after, "via": "platform_put"},
        request=request,
    )
    return PlatformReviewUpdateResponse(review=_review_summary_from_public(updated))


@router.get("/admin/audit-logs", response_model=PlatformAuditLogResponse, summary="Compliance audit trail")
def platform_audit_logs(
    _: User = Depends(require_platform_audit_read),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
) -> PlatformAuditLogResponse:
    offset = (page - 1) * limit
    rows, total = list_audit_logs(db, limit=limit, offset=offset)
    total_pages = max(1, (total + limit - 1) // limit) if total else 1
    logs = [
        PlatformAuditLogEntry(
            id=row.id,
            user_email=row.actor_email,
            action=row.action,
            resource=f"{row.resource_type}:{row.resource_id or ''}".rstrip(":"),
            details=row.summary,
            ip_address=row.ip_address,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return PlatformAuditLogResponse(logs=logs, total=total, page=page, limit=limit, totalPages=total_pages)


@router.get("/ingestion/email/status", summary="Email pipeline status (stub)")
def ingestion_email_status(_: User = Depends(require_platform_authenticated)) -> dict:
    return {
        "success": True,
        "stats": {
            "watcherState": "NOT_CONFIGURED",
            "queueLength": 0,
            "lastProcessedAt": None,
            "message": "Email-SFTP ingestion is not deployed in this environment.",
        },
    }


@router.get("/ingestion/playstore/status", summary="Play Store pipeline status")
def ingestion_playstore_status(
    _: User = Depends(require_platform_authenticated),
    review_db: Session = Depends(get_review_db),
) -> dict:
    from sqlalchemy import func, select

    total = review_db.scalar(
        select(func.count())
        .select_from(PlayStoreReview)
        .where(PlayStoreReview.channel == "Google Playstore")
    ) or 0
    latest = review_db.scalar(
        select(func.max(PlayStoreReview.created_at)).where(PlayStoreReview.channel == "Google Playstore")
    )
    return {
        "success": True,
        "stats": {
            "watcherState": "ACTIVE",
            "storedReviews": int(total),
            "lastIngestedAt": latest.isoformat() if latest else None,
        },
    }


@router.get("/ingestion/chatbot/status", summary="Chatbot pipeline status (stub)")
def ingestion_chatbot_status(_: User = Depends(require_platform_authenticated)) -> dict:
    return {
        "success": True,
        "stats": {
            "watcherState": "NOT_CONFIGURED",
            "storedReviews": 0,
            "message": "Chatbot ingestion is not deployed in this environment.",
        },
    }
