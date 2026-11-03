from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.review_base import ReviewBase


class PlayStoreReview(ReviewBase):
    __tablename__ = "review"

    channel: Mapped[str] = mapped_column(String(100), primary_key=False)
    unique_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    app_version_code: Mapped[str] = mapped_column(String(50))
    app_version_name: Mapped[str] = mapped_column(String(100))
    review_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    star_ratings: Mapped[int] = mapped_column(SmallInteger)
    review_text: Mapped[str] = mapped_column(String(1000))
    category: Mapped[str] = mapped_column(String(100))
    subcategory: Mapped[str] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("review_category.id"), nullable=True)
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("review_subcategory.id"), nullable=True)
    priority_id: Mapped[int | None] = mapped_column(ForeignKey("review_priority.id"), nullable=True)
    priority: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    resolution: Mapped[str] = mapped_column(String(1000))
    department: Mapped[str] = mapped_column(String(100))
    response_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    resolution_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    developer_reply_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    developer_reply_text: Mapped[str] = mapped_column(String(1000))
    review_link: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
