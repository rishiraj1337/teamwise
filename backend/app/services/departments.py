import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Department


def slugify_department(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    slug = slug.strip("-")
    return slug or "workspace"


def resolve_department(db: Session, department_name: str) -> Department:
    normalized = department_name.strip()
    existing = db.scalar(
        select(Department).where(
            (func.lower(Department.name) == normalized.lower())
            | (func.lower(Department.code) == normalized.lower())
        )
    )
    if existing is not None:
        return existing

    code = slugify_department(normalized)
    department = Department(name=normalized, code=code)
    db.add(department)
    db.flush()
    return department
