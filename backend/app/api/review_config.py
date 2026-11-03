from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_operations_reviews_access
from app.db.review_session import get_review_db
from app.db.session import get_db
from app.models import User
from app.schemas.review_config import (
    ReviewCategoryCreate,
    ReviewCategoryPublic,
    ReviewCategoryUpdate,
    ReviewConfigResponse,
    ReviewPriorityPublic,
    ReviewSubcategoryCreate,
    ReviewSubcategoryPublic,
    ReviewSubcategoryUpdate,
)
from app.services.audit import record_audit
from app.services.review_config import (
    create_category,
    create_subcategory,
    list_review_config,
    update_category,
    update_subcategory,
)

router = APIRouter(prefix="/review-config", tags=["review-config"])


def _to_config_response(priorities, categories) -> ReviewConfigResponse:
    return ReviewConfigResponse(
        priorities=[ReviewPriorityPublic.model_validate(item) for item in priorities],
        categories=[
            ReviewCategoryPublic.model_validate(
                {
                    "id": category.id,
                    "name": category.name,
                    "is_active": category.is_active,
                    "subcategories": [
                        ReviewSubcategoryPublic.model_validate(sub) for sub in category.subcategories
                    ],
                }
            )
            for category in categories
        ],
    )


@router.get("", response_model=ReviewConfigResponse, summary="List classification configuration")
def get_review_config(
    _: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
) -> ReviewConfigResponse:
    priorities, categories = list_review_config(review_db, include_inactive=True)
    return _to_config_response(priorities, categories)


@router.post(
    "/categories",
    response_model=ReviewCategoryPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a review category",
)
def post_category(
    payload: ReviewCategoryCreate,
    request: Request,
    current_user: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
) -> ReviewCategoryPublic:
    try:
        category = create_category(review_db, payload.name)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    record_audit(
        db,
        action="review_config.category.create",
        resource_type="review_category",
        resource_id=str(category.id),
        summary=f"Created category {category.name}",
        actor=current_user,
        metadata={"name": category.name},
        request=request,
    )
    return ReviewCategoryPublic.model_validate({**category.__dict__, "subcategories": []})


@router.patch("/categories/{category_id}", response_model=ReviewCategoryPublic)
def patch_category(
    category_id: int,
    payload: ReviewCategoryUpdate,
    request: Request,
    current_user: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
) -> ReviewCategoryPublic:
    try:
        category = update_category(
            review_db,
            category_id,
            name=payload.name,
            is_active=payload.is_active,
        )
    except ValueError as error:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in str(error).lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    record_audit(
        db,
        action="review_config.category.update",
        resource_type="review_category",
        resource_id=str(category.id),
        summary=f"Updated category {category.name}",
        actor=current_user,
        metadata=payload.model_dump(exclude_none=True),
        request=request,
    )
    return ReviewCategoryPublic.model_validate({**category.__dict__, "subcategories": []})


@router.post(
    "/categories/{category_id}/subcategories",
    response_model=ReviewSubcategoryPublic,
    status_code=status.HTTP_201_CREATED,
)
def post_subcategory(
    category_id: int,
    payload: ReviewSubcategoryCreate,
    request: Request,
    current_user: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
) -> ReviewSubcategoryPublic:
    try:
        subcategory = create_subcategory(review_db, category_id, payload.name)
    except ValueError as error:
        status_code = status.HTTP_404_NOT_FOUND if "Category not found" in str(error) else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    record_audit(
        db,
        action="review_config.subcategory.create",
        resource_type="review_subcategory",
        resource_id=str(subcategory.id),
        summary=f"Created subcategory {subcategory.name}",
        actor=current_user,
        metadata={"category_id": category_id, "name": subcategory.name},
        request=request,
    )
    return ReviewSubcategoryPublic.model_validate(subcategory)


@router.patch("/subcategories/{subcategory_id}", response_model=ReviewSubcategoryPublic)
def patch_subcategory(
    subcategory_id: int,
    payload: ReviewSubcategoryUpdate,
    request: Request,
    current_user: User = Depends(require_operations_reviews_access),
    review_db: Session = Depends(get_review_db),
    db: Session = Depends(get_db),
) -> ReviewSubcategoryPublic:
    try:
        subcategory = update_subcategory(
            review_db,
            subcategory_id,
            name=payload.name,
            is_active=payload.is_active,
        )
    except ValueError as error:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in str(error).lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    record_audit(
        db,
        action="review_config.subcategory.update",
        resource_type="review_subcategory",
        resource_id=str(subcategory.id),
        summary=f"Updated subcategory {subcategory.name}",
        actor=current_user,
        metadata=payload.model_dump(exclude_none=True),
        request=request,
    )
    return ReviewSubcategoryPublic.model_validate(subcategory)
