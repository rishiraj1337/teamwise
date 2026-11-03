from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewPriorityPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool


class ReviewSubcategoryPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    name: str
    is_active: bool


class ReviewCategoryPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool
    subcategories: list[ReviewSubcategoryPublic] = Field(default_factory=list)


class ReviewConfigResponse(BaseModel):
    priorities: list[ReviewPriorityPublic]
    categories: list[ReviewCategoryPublic]


class ReviewCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ReviewCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


class ReviewSubcategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ReviewSubcategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None
