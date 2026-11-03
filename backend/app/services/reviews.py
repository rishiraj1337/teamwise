from datetime import datetime, timedelta, timezone

from sqlalchemy import asc, case, desc, func, select
from sqlalchemy.orm import Session

from app.models.review import PlayStoreReview
from app.services.review_taxonomy import taxonomy_for_operations, validate_review_ops_fields
from app.schemas.review import (
    CategoryBreakdown,
    ChartSlice,
    ReviewAnalyticsResponse,
    ReviewFilterOptions,
    ReviewListResponse,
    ReviewPublic,
    ReviewUpdate,
)

OPEN_STATUSES = {"new", "in progress", "open", "pending"}
RESOLVED_STATUSES = {"resolved", "closed", "done", "complete"}


def _distinct_column_values(db: Session, column) -> list[str]:
    rows = db.execute(
        select(column)
        .where(column != "N/A")
        .where(column.is_not(None))
        .distinct()
        .order_by(column)
    ).all()
    return [str(value[0]) for value in rows if value[0]]


SORT_COLUMNS = {
    "review_timestamp": PlayStoreReview.review_timestamp,
    "star_ratings": PlayStoreReview.star_ratings,
    "created_at": PlayStoreReview.created_at,
    "unique_id": PlayStoreReview.unique_id,
}


def _review_filters(
    search: str | None,
    category: str | None,
    priority: str | None,
    status: str | None,
    min_rating: int | None,
    max_rating: int | None,
    channel: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
):
    filters = []
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            (PlayStoreReview.review_text.like(term))
            | (PlayStoreReview.unique_id.like(term))
            | (PlayStoreReview.category.like(term))
            | (PlayStoreReview.subcategory.like(term))
            | (PlayStoreReview.department.like(term))
        )
    if channel and channel.lower() != "all":
        filters.append(PlayStoreReview.channel == channel)
    if category and category.lower() != "all":
        filters.append(PlayStoreReview.category == category)
    if priority and priority.lower() != "all":
        filters.append(PlayStoreReview.priority == priority)
    if status and status.lower() != "all":
        filters.append(PlayStoreReview.status == status)
    if min_rating is not None:
        filters.append(PlayStoreReview.star_ratings >= min_rating)
    if max_rating is not None:
        filters.append(PlayStoreReview.star_ratings <= max_rating)
    if start_date is not None:
        filters.append(PlayStoreReview.review_timestamp >= start_date)
    if end_date is not None:
        filters.append(PlayStoreReview.review_timestamp <= end_date)
    return filters


def _apply_review_sort(query, sort_by: str | None, sort_order: str | None):
    column = SORT_COLUMNS.get((sort_by or "created_at").strip().lower(), PlayStoreReview.created_at)
    order = (sort_order or "DESC").strip().upper()
    ordering = desc(column) if order != "ASC" else asc(column)
    return query.order_by(ordering)


def list_reviews(
    db: Session,
    limit: int,
    offset: int,
    search: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    min_rating: int | None = None,
    max_rating: int | None = None,
    channel: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
) -> ReviewListResponse:
    filters = _review_filters(
        search,
        category,
        priority,
        status,
        min_rating,
        max_rating,
        channel=channel,
        start_date=start_date,
        end_date=end_date,
    )
    count_query = select(func.count()).select_from(PlayStoreReview)
    list_query = select(PlayStoreReview)
    for clause in filters:
        count_query = count_query.where(clause)
        list_query = list_query.where(clause)

    total = db.scalar(count_query) or 0
    list_query = _apply_review_sort(list_query, sort_by, sort_order)
    rows = db.scalars(list_query.limit(limit).offset(offset)).all()
    return ReviewListResponse(
        items=[ReviewPublic.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


def review_analytics(db: Session) -> ReviewAnalyticsResponse:
    category_rows = db.execute(
        select(PlayStoreReview.category, func.count())
        .where(PlayStoreReview.category != "N/A")
        .group_by(PlayStoreReview.category)
        .order_by(func.count().desc())
    ).all()
    category_breakdown = [
        ChartSlice(label=str(label or "Unknown"), value=int(count)) for label, count in category_rows
    ]
    category_detail_rows = db.execute(
        select(PlayStoreReview.category, PlayStoreReview.subcategory, func.count())
        .where(PlayStoreReview.category != "N/A")
        .group_by(PlayStoreReview.category, PlayStoreReview.subcategory)
        .order_by(PlayStoreReview.category, func.count().desc())
    ).all()
    category_detail_by_name: dict[str, list[ChartSlice]] = {}
    for category, subcategory, count in category_detail_rows:
        category_name = str(category or "Unknown")
        category_detail_by_name.setdefault(category_name, []).append(
            ChartSlice(label=str(subcategory or "Unknown"), value=int(count))
        )
    category_detail = [
        CategoryBreakdown(category=item.label, count=item.value, subcategories=category_detail_by_name.get(item.label, []))
        for item in category_breakdown
    ]

    sentiment_label = case(
        (PlayStoreReview.star_ratings >= 4, "Positive"),
        else_="Negative",
    )
    sentiment_rows = db.execute(
        select(sentiment_label, func.count()).group_by(sentiment_label)
    ).all()
    sentiment_breakdown = [
        ChartSlice(label=str(label), value=int(count)) for label, count in sentiment_rows
    ]

    priority_rows = db.execute(
        select(PlayStoreReview.priority, func.count())
        .where(PlayStoreReview.priority != "N/A")
        .group_by(PlayStoreReview.priority)
        .order_by(func.count().desc())
    ).all()
    priority_breakdown = [
        ChartSlice(label=str(label or "Unknown"), value=int(count)) for label, count in priority_rows
    ]

    status_rows = db.execute(
        select(func.lower(PlayStoreReview.status), func.count())
        .where(PlayStoreReview.status != "N/A")
        .group_by(func.lower(PlayStoreReview.status))
    ).all()
    open_count = 0
    resolved_count = 0
    for status, count in status_rows:
        normalized = str(status or "").strip().lower()
        if normalized in OPEN_STATUSES:
            open_count += int(count)
        elif normalized in RESOLVED_STATUSES:
            resolved_count += int(count)

    priorities, category_map, status_names = taxonomy_for_operations(db)

    return ReviewAnalyticsResponse(
        category_breakdown=category_breakdown,
        category_detail=category_detail,
        sentiment_breakdown=sentiment_breakdown,
        priority_breakdown=priority_breakdown,
        ticket_breakdown=[
            ChartSlice(label="Open", value=open_count),
            ChartSlice(label="Resolved", value=resolved_count),
        ],
        filter_options=ReviewFilterOptions(
            categories=sorted(category_map.keys()),
            priorities=priorities,
            statuses=status_names,
            channels=_distinct_column_values(db, PlayStoreReview.channel),
        ),
    )


def review_platform_stats(db: Session) -> dict:
    total = db.scalar(select(func.count()).select_from(PlayStoreReview)) or 0
    average = db.scalar(select(func.avg(PlayStoreReview.star_ratings))) or 0.0
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    past_24h = (
        db.scalar(
            select(func.count())
            .select_from(PlayStoreReview)
            .where(PlayStoreReview.created_at >= cutoff)
        )
        or 0
    )
    rating_rows = db.execute(
        select(PlayStoreReview.star_ratings, func.count()).group_by(PlayStoreReview.star_ratings)
    ).all()
    ratings_distribution = {str(stars): int(count) for stars, count in rating_rows if stars is not None}
    for star in range(1, 6):
        ratings_distribution.setdefault(str(star), 0)

    channel_rows = db.execute(
        select(PlayStoreReview.channel, func.count())
        .where(PlayStoreReview.channel.is_not(None))
        .group_by(PlayStoreReview.channel)
    ).all()
    channels = {str(name): int(count) for name, count in channel_rows if name}

    category_rows = db.execute(
        select(PlayStoreReview.category, func.count())
        .where(PlayStoreReview.category != "N/A")
        .group_by(PlayStoreReview.category)
        .order_by(func.count().desc())
        .limit(50)
    ).all()
    categories = [{"category": str(name), "count": int(count)} for name, count in category_rows]

    return {
        "totalReviews": int(total),
        "averageRating": round(float(average), 2),
        "past24hVolume": int(past_24h),
        "ratingsDistribution": ratings_distribution,
        "channels": channels,
        "categories": categories,
    }


def fetch_reviews_for_export(
    db: Session,
    *,
    limit: int = 5000,
    search: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    min_rating: int | None = None,
    max_rating: int | None = None,
    channel: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[PlayStoreReview]:
    query = select(PlayStoreReview)
    for clause in _review_filters(
        search,
        category,
        priority,
        status,
        min_rating,
        max_rating,
        channel=channel,
        start_date=start_date,
        end_date=end_date,
    ):
        query = query.where(clause)
    return list(
        db.scalars(query.order_by(PlayStoreReview.created_at.desc()).limit(limit)).all()
    )


def _review_ops_snapshot(review: PlayStoreReview) -> dict[str, str | None]:
    return {
        "category": review.category,
        "subcategory": review.subcategory,
        "priority": review.priority,
        "status": review.status,
        "department": review.department,
        "resolution": review.resolution,
        "response_timestamp": review.response_timestamp.isoformat() if review.response_timestamp else None,
        "developer_reply_text": review.developer_reply_text,
        "developer_reply_time": review.developer_reply_time.isoformat() if review.developer_reply_time else None,
        "review_link": review.review_link,
        "updated_at": review.updated_at.isoformat() if review.updated_at else None,
    }


def update_review(
    db: Session, unique_id: str, payload: ReviewUpdate
) -> tuple[ReviewPublic, dict[str, str | None], dict[str, str | None]]:
    review = db.get(PlayStoreReview, unique_id)
    if review is None:
        raise ValueError("Review not found.")

    category_row, subcategory_row, priority_row, status_row = validate_review_ops_fields(
        db,
        payload.category,
        payload.subcategory,
        payload.priority,
        payload.status,
    )

    before = _review_ops_snapshot(review)

    review.category = category_row.name
    review.subcategory = subcategory_row.name
    review.category_id = category_row.id
    review.subcategory_id = subcategory_row.id
    review.priority = priority_row.name
    review.priority_id = priority_row.id
    review.status = status_row.name
    review.department = payload.department
    review.resolution = payload.resolution
    review.response_timestamp = payload.response_timestamp
    review.developer_reply_text = payload.developer_reply_text
    review.developer_reply_time = payload.developer_reply_time
    review.review_link = payload.review_link
    review.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(review)

    after = _review_ops_snapshot(review)
    return ReviewPublic.model_validate(review), before, after
