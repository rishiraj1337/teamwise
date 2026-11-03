from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.review_config import ReviewCategory, ReviewPriority, ReviewStatus, ReviewSubcategory


_LEGACY_CATEGORY_ALIASES: dict[str, str] = {
    "playstore feedback": "Playstore review",
}

_LEGACY_SUBCATEGORY_ALIASES: dict[str, dict[str, str]] = {
    "Playstore review": {
        "positive": "Positive",
        "negative": "Negative",
    },
}


def _active_priorities(db: Session) -> list[ReviewPriority]:
    return list(db.scalars(select(ReviewPriority).where(ReviewPriority.is_active.is_(True)).order_by(ReviewPriority.id)).all())


def _active_categories(db: Session) -> list[ReviewCategory]:
    return list(
        db.scalars(select(ReviewCategory).where(ReviewCategory.is_active.is_(True)).order_by(ReviewCategory.name)).all()
    )


def _active_subcategories(db: Session, category_id: int) -> list[ReviewSubcategory]:
    return list(
        db.scalars(
            select(ReviewSubcategory)
            .where(
                ReviewSubcategory.category_id == category_id,
                ReviewSubcategory.is_active.is_(True),
            )
            .order_by(ReviewSubcategory.name)
        ).all()
    )


def _active_statuses(db: Session) -> list[ReviewStatus]:
    return list(
        db.scalars(
            select(ReviewStatus)
            .where(ReviewStatus.is_active.is_(True))
            .order_by(ReviewStatus.sort_order, ReviewStatus.id)
        ).all()
    )


def taxonomy_for_operations(db: Session) -> tuple[list[str], dict[str, tuple[str, ...]], list[str]]:
    priorities = [item.name for item in _active_priorities(db)]
    categories: dict[str, tuple[str, ...]] = {}
    for category in _active_categories(db):
        subs = tuple(item.name for item in _active_subcategories(db, category.id))
        categories[category.name] = subs
    statuses = [item.name for item in _active_statuses(db)]
    return priorities, categories, statuses


def canonical_category(db: Session, category: str) -> ReviewCategory | None:
    trimmed = category.strip()
    row = db.scalar(select(ReviewCategory).where(func.lower(ReviewCategory.name) == trimmed.lower()))
    if row is not None:
        return row if row.is_active else None
    alias = _LEGACY_CATEGORY_ALIASES.get(trimmed.lower())
    if alias:
        return db.scalar(select(ReviewCategory).where(ReviewCategory.name == alias, ReviewCategory.is_active.is_(True)))
    return None


def canonical_subcategory(db: Session, category: ReviewCategory, subcategory: str) -> ReviewSubcategory | None:
    trimmed = subcategory.strip()
    row = db.scalar(
        select(ReviewSubcategory).where(
            ReviewSubcategory.category_id == category.id,
            func.lower(ReviewSubcategory.name) == trimmed.lower(),
            ReviewSubcategory.is_active.is_(True),
        )
    )
    if row is not None:
        return row
    legacy = _LEGACY_SUBCATEGORY_ALIASES.get(category.name, {}).get(trimmed.lower())
    if legacy:
        return db.scalar(
            select(ReviewSubcategory).where(
                ReviewSubcategory.category_id == category.id,
                ReviewSubcategory.name == legacy,
                ReviewSubcategory.is_active.is_(True),
            )
        )
    return None


def canonical_priority(db: Session, priority: str) -> ReviewPriority | None:
    trimmed = priority.strip()
    lowered = trimmed.lower()
    if lowered == "moderate":
        trimmed = "Medium"
        lowered = "medium"
    if lowered in ("n/a", ""):
        return None
    return db.scalar(
        select(ReviewPriority).where(
            func.lower(ReviewPriority.name) == lowered,
            ReviewPriority.is_active.is_(True),
        )
    )


def canonical_status(db: Session, status: str) -> ReviewStatus | None:
    trimmed = status.strip()
    lowered = trimmed.lower()
    aliases = {
        "open": "New",
        "pending": "New",
        "new": "New",
        "in progress": "In Progress",
        "in_progress": "In Progress",
        "inprogress": "In Progress",
        "resolved": "Resolved",
        "done": "Resolved",
        "complete": "Resolved",
        "closed": "Closed",
        "n/a": "N/A",
    }
    canonical_name = aliases.get(lowered, trimmed)
    return db.scalar(
        select(ReviewStatus).where(
            ReviewStatus.name == canonical_name,
            ReviewStatus.is_active.is_(True),
        )
    )


def validate_review_ops_fields(
    db: Session, category: str, subcategory: str, priority: str, status: str
) -> tuple[ReviewCategory, ReviewSubcategory, ReviewPriority, ReviewStatus]:
    cat = canonical_category(db, category)
    if cat is None:
        raise ValueError("Select a valid category.")
    sub = canonical_subcategory(db, cat, subcategory)
    if sub is None:
        raise ValueError("Select a valid subcategory for the chosen category.")
    pri = canonical_priority(db, priority)
    if pri is None:
        raise ValueError("Priority must be Low, Medium, High, or Urgent.")
    stat = canonical_status(db, status)
    if stat is None:
        raise ValueError("Select a valid status.")
    return cat, sub, pri, stat
