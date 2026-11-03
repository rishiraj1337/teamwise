from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unique_id: str
    channel: str
    review_timestamp: datetime
    star_ratings: int
    review_text: str
    category: str
    subcategory: str
    priority: str
    status: str
    resolution: str
    department: str
    response_timestamp: datetime | None = None
    resolution_date: date | None = None
    developer_reply_time: datetime | None = None
    developer_reply_text: str
    review_link: str
    created_at: datetime
    updated_at: datetime


class ReviewUpdate(BaseModel):
    category: str = Field(max_length=100)
    subcategory: str = Field(max_length=2000)
    priority: str = Field(max_length=50)
    status: str = Field(max_length=50)
    department: str = Field(max_length=100)
    resolution: str = Field(max_length=1000)
    response_timestamp: datetime | None = None
    developer_reply_text: str = Field(max_length=1000)
    developer_reply_time: datetime | None = None
    review_link: str = Field(max_length=100)


class ReviewListResponse(BaseModel):
    items: list[ReviewPublic]
    total: int
    limit: int
    offset: int


class ReviewExportAudit(BaseModel):
    row_count: int = Field(ge=0)
    export_type: str | None = Field(default=None, max_length=50)
    search: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    priority: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    min_rating: int | None = Field(default=None, ge=1, le=5)
    max_rating: int | None = Field(default=None, ge=1, le=5)
    channel: str | None = Field(default=None, max_length=100)
    start_date: date | None = Field(default=None)
    end_date: date | None = Field(default=None)


class ChartSlice(BaseModel):
    label: str
    value: int


class ReviewFilterOptions(BaseModel):
    categories: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    channels: list[str] = Field(default_factory=list)


class ReviewCategoryOption(BaseModel):
    name: str
    subcategories: list[str]


class ReviewTaxonomyResponse(BaseModel):
    priorities: list[str]
    categories: list[ReviewCategoryOption]
    statuses: list[str] = Field(default_factory=list)


class CategoryBreakdown(BaseModel):
    category: str
    count: int
    subcategories: list[ChartSlice]


class ReviewAnalyticsResponse(BaseModel):
    category_breakdown: list[ChartSlice]
    category_detail: list[CategoryBreakdown] = Field(default_factory=list)
    sentiment_breakdown: list[ChartSlice]
    priority_breakdown: list[ChartSlice]
    ticket_breakdown: list[ChartSlice] = Field(
        default_factory=lambda: [
            ChartSlice(label="Open", value=0),
            ChartSlice(label="Resolved", value=0),
        ]
    )
    filter_options: ReviewFilterOptions = Field(default_factory=ReviewFilterOptions)
