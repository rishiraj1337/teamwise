from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_operations_reviews_access
from app.db.review_session import get_review_db
from app.db.session import get_db
from app.models import User
from app.schemas.review import (
    ReviewAnalyticsResponse,
    ReviewExportAudit,
    ReviewListResponse,
    ReviewPublic,
    ReviewTaxonomyResponse,
    ReviewUpdate,
    ReviewCategoryOption,
)
from app.services.audit import record_audit
from app.services.review_taxonomy import taxonomy_for_operations
from app.services.reviews import list_reviews, review_analytics, update_review

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get(
    "/taxonomy",
    response_model=ReviewTaxonomyResponse,
    summary="Category, subcategory, and priority options for review updates",
)
def get_review_taxonomy(
    _: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
) -> ReviewTaxonomyResponse:
    priorities, categories, statuses = taxonomy_for_operations(review_db)
    return ReviewTaxonomyResponse(
        priorities=priorities,
        categories=[
            ReviewCategoryOption(name=name, subcategories=list(subs))
            for name, subs in categories.items()
        ],
        statuses=statuses,
    )


@router.get(
    "",
    response_model=ReviewListResponse,
    summary="List Play Store reviews",
)
def get_reviews(
    _: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
    limit: int = Query(default=10, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=200),
    category: str | None = Query(default=None, max_length=100),
    priority: str | None = Query(default=None, max_length=50),
    status: str | None = Query(default=None, max_length=50),
    min_rating: int | None = Query(default=None, ge=1, le=5),
    max_rating: int | None = Query(default=None, ge=1, le=5),
    channel: str | None = Query(default=None, max_length=100),
) -> ReviewListResponse:
    return list_reviews(
        review_db,
        limit=limit,
        offset=offset,
        search=search,
        category=category,
        priority=priority,
        status=status,
        min_rating=min_rating,
        max_rating=max_rating,
        channel=channel,
    )


@router.get(
    "/analytics",
    response_model=ReviewAnalyticsResponse,
    summary="Aggregated review metrics for dashboards",
)
def get_review_analytics(
    _: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
) -> ReviewAnalyticsResponse:
    return review_analytics(review_db)


@router.post(
    "/export-audit",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Record a CSV export event in the audit log",
)
def log_review_export(
    payload: ReviewExportAudit,
    request: Request,
    current_user: User = Depends(require_operations_reviews_access),
    db: Session = Depends(get_db),
) -> None:
    filters = {
        key: value
        for key, value in {
            "search": payload.search,
            "category": payload.category,
            "priority": payload.priority,
            "status": payload.status,
            "min_rating": payload.min_rating,
            "max_rating": payload.max_rating,
            "channel": payload.channel,
            "start_date": payload.start_date.isoformat() if payload.start_date else None,
            "end_date": payload.end_date.isoformat() if payload.end_date else None,
        }.items()
        if value is not None and value != "" and value != "All"
    }
    category_breakdown_export = payload.export_type == "category_breakdown"
    record_audit(
        db,
        action="review.category_breakdown.export_csv" if category_breakdown_export else "review.export_csv",
        resource_type="review",
        summary=(
            f"Exported category-wise review breakdown totaling {payload.row_count} review(s) to CSV"
            if category_breakdown_export
            else f"Exported {payload.row_count} review(s) to CSV"
        ),
        actor=current_user,
        metadata={"row_count": payload.row_count, "export_type": payload.export_type, "filters": filters},
        request=request,
    )


@router.patch(
    "/{unique_id}",
    response_model=ReviewPublic,
    summary="Update operational fields on a Play Store review",
)
def patch_review(
    unique_id: str,
    payload: ReviewUpdate,
    request: Request,
    current_user: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
) -> ReviewPublic:
    try:
        updated, before, after = update_review(review_db, unique_id, payload)
    except ValueError as error:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in str(error).lower() else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(
            status_code=status_code,
            detail=str(error),
        ) from error

    record_audit(
        db,
        action="review.update",
        resource_type="review",
        resource_id=unique_id,
        summary=f"Updated review {unique_id}",
        actor=current_user,
        metadata={"before": before, "after": after},
        request=request,
    )
    return updated
