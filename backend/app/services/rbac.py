from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Permission, Role, RolePermission, User, UserRole


def get_user_permissions(db: Session, user: User) -> set[tuple[str, str]]:
    rows = db.scalars(
        select(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id)
        .distinct()
    ).all()
    return {(permission.resource, permission.action) for permission in rows}


def user_has_permission(db: Session, user: User, resource: str, action: str) -> bool:
    if not user.is_active:
        return False
    return (resource, action) in get_user_permissions(db, user)


def permission_codes(db: Session, user: User) -> list[str]:
    return sorted(f"{resource}:{action}" for resource, action in get_user_permissions(db, user))


def primary_role_name(db: Session, user: User) -> str:
    assignment = db.scalar(
        select(UserRole)
        .options(selectinload(UserRole.role))
        .where(UserRole.user_id == user.id)
        .order_by(UserRole.role_id)
    )
    if assignment is None or assignment.role is None:
        return "employee"
    return assignment.role.name
