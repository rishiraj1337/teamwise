from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Role, User, UserRole
from app.schemas.user import UserPublic
from app.services.rbac import permission_codes, primary_role_name


def build_user_public(db: Session, user: User) -> UserPublic:
    loaded = db.scalar(
        select(User)
        .options(
            selectinload(User.department),
            selectinload(User.role_assignments).selectinload(UserRole.role),
        )
        .where(User.emp_id == user.emp_id)
    )
    if loaded is None:
        loaded = user
    department_name = loaded.department.name if loaded.department is not None else "Workspace"
    return UserPublic(
        emp_id=loaded.emp_id,
        email=loaded.email,
        name=loaded.name,
        department_id=loaded.department_id,
        department=department_name,
        role=primary_role_name(db, loaded),
        job_title=loaded.job_title,
        mobile_number=loaded.mobile_number,
        permissions=permission_codes(db, loaded),
    )


def assign_role(
    db: Session,
    user: User,
    role_name: str,
    department_id: int,
) -> None:
    normalized_role = role_name.strip().lower()
    role = db.scalar(select(Role).where(Role.name == normalized_role))
    if role is None:
        role = db.scalar(select(Role).where(Role.name == "employee"))
    if role is None:
        raise ValueError("RBAC roles are not seeded")

    db.add(
        UserRole(
            user_id=user.id,
            role_id=role.id,
            department_id=department_id,
        )
    )
