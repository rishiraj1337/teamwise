import csv
import io
import json
from datetime import datetime
from typing import Any

from app.models.review import PlayStoreReview


def _sanitize_csv_cell(value: Any) -> str:
    text = "" if value is None else str(value)
    if text and text[0] in {"=", "+", "-", "@", "\t", "\r"}:
        return f"'{text}"
    return text


def reviews_to_csv_rows(reviews: list[PlayStoreReview]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "unique_id",
            "channel",
            "review_timestamp",
            "star_ratings",
            "category",
            "subcategory",
            "priority",
            "status",
            "department",
            "resolution",
            "review_text",
            "created_at",
        ]
    )
    for review in reviews:
        writer.writerow(
            [
                _sanitize_csv_cell(review.unique_id),
                _sanitize_csv_cell(review.channel),
                _sanitize_csv_cell(review.review_timestamp.isoformat() if review.review_timestamp else ""),
                _sanitize_csv_cell(review.star_ratings),
                _sanitize_csv_cell(review.category),
                _sanitize_csv_cell(review.subcategory),
                _sanitize_csv_cell(review.priority),
                _sanitize_csv_cell(review.status),
                _sanitize_csv_cell(review.department),
                _sanitize_csv_cell(review.resolution),
                _sanitize_csv_cell(review.review_text),
                _sanitize_csv_cell(review.created_at.isoformat() if review.created_at else ""),
            ]
        )
    return buffer.getvalue()


def reviews_to_json_export(reviews: list[PlayStoreReview]) -> str:
    payload = [
        {
            "unique_id": review.unique_id,
            "channel": review.channel,
            "review_timestamp": review.review_timestamp.isoformat() if review.review_timestamp else None,
            "star_ratings": review.star_ratings,
            "category": review.category,
            "subcategory": review.subcategory,
            "priority": review.priority,
            "status": review.status,
            "department": review.department,
            "resolution": review.resolution,
            "review_text": review.review_text,
            "created_at": review.created_at.isoformat() if review.created_at else None,
        }
        for review in reviews
    ]
    return json.dumps(payload, indent=2)
