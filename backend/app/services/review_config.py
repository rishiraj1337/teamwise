from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.review_config import ReviewCategory, ReviewPriority, ReviewSubcategory


def list_review_config(db: Session, *, include_inactive: bool = True) -> tuple[list[ReviewPriority], list[ReviewCategory]]:
    priority_query = select(ReviewPriority).order_by(ReviewPriority.id)
    if not include_inactive:
        priority_query = priority_query.where(ReviewPriority.is_active.is_(True))
    priorities = list(db.scalars(priority_query).all())

    category_query = (
        select(ReviewCategory)
        .options(selectinload(ReviewCategory.subcategories))
        .order_by(ReviewCategory.name)
    )
    if not include_inactive:
        category_query = category_query.where(ReviewCategory.is_active.is_(True))
    categories = list(db.scalars(category_query).all())
    if not include_inactive:
        for category in categories:
            category.subcategories = [item for item in category.subcategories if item.is_active]
    return priorities, categories


def create_category(db: Session, name: str) -> ReviewCategory:
    trimmed = name.strip()
    existing = db.scalar(select(ReviewCategory).where(func.lower(ReviewCategory.name) == trimmed.lower()))
    if existing is not None:
        raise ValueError("A category with this name already exists.")
    category = ReviewCategory(name=trimmed, is_active=True)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: Session, category_id: int, *, name: str | None, is_active: bool | None) -> ReviewCategory:
    category = db.get(ReviewCategory, category_id)
    if category is None:
        raise ValueError("Category not found.")
    if name is not None:
        trimmed = name.strip()
        duplicate = db.scalar(
            select(ReviewCategory).where(
                func.lower(ReviewCategory.name) == trimmed.lower(),
                ReviewCategory.id != category_id,
            )
        )
        if duplicate is not None:
            raise ValueError("A category with this name already exists.")
        category.name = trimmed
    if is_active is not None:
        category.is_active = is_active
    db.commit()
    db.refresh(category)
    return category


def create_subcategory(db: Session, category_id: int, name: str) -> ReviewSubcategory:
    category = db.get(ReviewCategory, category_id)
    if category is None:
        raise ValueError("Category not found.")
    trimmed = name.strip()
    existing = db.scalar(
        select(ReviewSubcategory).where(
            ReviewSubcategory.category_id == category_id,
            func.lower(ReviewSubcategory.name) == trimmed.lower(),
        )
    )
    if existing is not None:
        raise ValueError("This subcategory already exists for the category.")
    subcategory = ReviewSubcategory(category_id=category_id, name=trimmed, is_active=True)
    db.add(subcategory)
    db.commit()
    db.refresh(subcategory)
    return subcategory


def update_subcategory(
    db: Session,
    subcategory_id: int,
    *,
    name: str | None,
    is_active: bool | None,
) -> ReviewSubcategory:
    subcategory = db.get(ReviewSubcategory, subcategory_id)
    if subcategory is None:
        raise ValueError("Subcategory not found.")
    if name is not None:
        trimmed = name.strip()
        duplicate = db.scalar(
            select(ReviewSubcategory).where(
                ReviewSubcategory.category_id == subcategory.category_id,
                func.lower(ReviewSubcategory.name) == trimmed.lower(),
                ReviewSubcategory.id != subcategory_id,
            )
        )
        if duplicate is not None:
            raise ValueError("This subcategory already exists for the category.")
        subcategory.name = trimmed
    if is_active is not None:
        subcategory.is_active = is_active
    db.commit()
    db.refresh(subcategory)
    return subcategory
