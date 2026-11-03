from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.review import ReviewUpdate


class PlatformSuccess(BaseModel):
    success: bool = True


class PlatformLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=128)


class PlatformUser(BaseModel):
    id: int
    emp_id: str
    email: str
    name: str
    role: str
    status: str
    department: str
    department_id: int
    permissions: list[str]


class PlatformLoginResponse(PlatformSuccess):
    token: str
    user: PlatformUser


class PlatformMeResponse(PlatformSuccess):
    user: PlatformUser


class PlatformReviewSummary(BaseModel):
    unique_id: str
    channel: str
    star_ratings: int
    review_text: str
    category: str
    subcategory: str
    priority: str
    status: str
    resolution: str
    department: str
    review_timestamp: datetime
    created_at: datetime
    updated_at: datetime | None = None
    response_timestamp: datetime | None = None
    developer_reply_text: str | None = None
    developer_reply_time: datetime | None = None
    review_link: str | None = None


class PlatformReviewListResponse(PlatformSuccess):
    reviews: list[PlatformReviewSummary]
    total: int
    page: int
    limit: int
    totalPages: int


class PlatformReviewStatsResponse(PlatformSuccess):
    stats: dict[str, Any]


class PlatformReviewPut(BaseModel):
    """Spec triage fields plus Teamwise operational fields (partial updates merge with existing row)."""

    status: str | None = None
    priority: str | None = None
    department: str | None = None
    resolution: str | None = None
    category: str | None = None
    subcategory: str | None = None
    response_timestamp: datetime | None = None
    developer_reply_text: str | None = None
    developer_reply_time: datetime | None = None
    review_link: str | None = None


class PlatformReviewUpdateResponse(PlatformSuccess):
    review: PlatformReviewSummary


class PlatformAuditLogEntry(BaseModel):
    id: int
    user_email: str | None
    action: str
    resource: str
    details: str | None
    ip_address: str | None
    created_at: datetime


class PlatformAuditLogResponse(PlatformSuccess):
    logs: list[PlatformAuditLogEntry]
    total: int
    page: int
    limit: int
    totalPages: int


def merge_platform_put(existing: Any, payload: PlatformReviewPut) -> ReviewUpdate:
    return ReviewUpdate(
        category=payload.category if payload.category is not None else existing.category,
        subcategory=payload.subcategory if payload.subcategory is not None else existing.subcategory,
        priority=payload.priority if payload.priority is not None else existing.priority,
        status=payload.status if payload.status is not None else existing.status,
        department=payload.department if payload.department is not None else existing.department,
        resolution=payload.resolution if payload.resolution is not None else existing.resolution,
        response_timestamp=(
            payload.response_timestamp if payload.response_timestamp is not None else existing.response_timestamp
        ),
        developer_reply_text=(
            payload.developer_reply_text
            if payload.developer_reply_text is not None
            else existing.developer_reply_text
        ),
        developer_reply_time=(
            payload.developer_reply_time
            if payload.developer_reply_time is not None
            else existing.developer_reply_time
        ),
        review_link=payload.review_link if payload.review_link is not None else existing.review_link,
    )
