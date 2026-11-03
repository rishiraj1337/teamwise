from sqlalchemy.orm import Session

from app.api.deps import _user_is_operations
from app.models import User
from app.services.rbac import permission_codes, primary_role_name
from app.services.users import build_user_public

PLATFORM_REVIEW_PERMISSIONS = frozenset(
    {
        "reviews:read",
        "reviews:write",
        "reviews:export",
        "audit:read",
        "pipeline:trigger",
        "settings:read",
        "settings:write",
    }
)


def platform_role_name(db: Session, user: User) -> str:
    role = primary_role_name(db, user).strip().lower()
    if role in {"admin", "manager", "analyst", "viewer"}:
        return role.upper()
    if _user_is_operations(db, user):
        return "ANALYST"
    return "VIEWER"


def platform_permissions(db: Session, user: User) -> list[str]:
    codes = set(permission_codes(db, user))
    if _user_is_operations(db, user):
        codes |= PLATFORM_REVIEW_PERMISSIONS
    return sorted(codes)


def platform_user_payload(db: Session, user: User) -> dict:
    public = build_user_public(db, user)
    return {
        "id": user.id,
        "emp_id": public.emp_id,
        "email": public.email,
        "name": public.name,
        "role": platform_role_name(db, user),
        "status": "ACTIVE" if user.is_active else "SUSPENDED",
        "department": public.department,
        "department_id": public.department_id,
        "permissions": platform_permissions(db, user),
    }
