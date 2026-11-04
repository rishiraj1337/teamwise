from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_operations_reviews_access
from app.db.session import get_db
from app.models import Permission, Role, RolePermission, User, UserRole
from app.schemas.admin_users import (
    PermissionOption,
    RoleOption,
    RolesMatrixResponse,
    TeamwiseUserSummary,
    TeamwiseUsersListResponse,
    UpdateRolesMatrixRequest,
    UpdateUserRoleRequest,
)
from app.services.rbac import primary_role_name

router = APIRouter(prefix="/admin", tags=["teamwise-admin"])


@router.get(
    "/users",
    response_model=TeamwiseUsersListResponse,
    summary="List Teamwise HR user accounts (teamwisedb)",
)
def list_teamwise_users(
    _: object = Depends(require_operations_reviews_access),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> TeamwiseUsersListResponse:
    total_count = db.scalar(select(func.count()).select_from(User)) or 0

    users = db.scalars(
        select(User)
        .options(
            selectinload(User.department),
            selectinload(User.role_assignments).selectinload(UserRole.role),
        )
        .order_by(User.email)
        .offset(offset)
        .limit(limit)
    ).all()

    rows: list[TeamwiseUserSummary] = []
    for user in users:
        department_name = user.department.name if user.department is not None else "Workspace"
        rows.append(
            TeamwiseUserSummary(
                id=user.id,
                emp_id=user.emp_id,
                email=user.email,
                name=user.name,
                department=department_name,
                role=primary_role_name(db, user),
                status="ACTIVE" if user.is_active else "INACTIVE",
            )
        )

    return TeamwiseUsersListResponse(users=rows, total=int(total_count), limit=limit, offset=offset)


@router.get(
    "/roles-matrix",
    response_model=RolesMatrixResponse,
    summary="Get roles, permissions and role-permissions matrix",
)
def get_roles_matrix(
    _: object = Depends(require_operations_reviews_access),
    db: Session = Depends(get_db),
) -> RolesMatrixResponse:
    roles = db.scalars(select(Role).order_by(Role.id)).all()
    permissions = db.scalars(select(Permission).order_by(Permission.id)).all()
    role_perms = db.scalars(select(RolePermission)).all()

    matrix: dict[str, list[int]] = {}
    for r in roles:
        matrix[str(r.id)] = [rp.permission_id for rp in role_perms if rp.role_id == r.id]

    return RolesMatrixResponse(
        roles=[RoleOption(id=r.id, name=r.name) for r in roles],
        permissions=[
            PermissionOption(
                id=p.id,
                resource=p.resource,
                action=p.action,
                key=f"{p.resource}:{p.action}",
            )
            for p in permissions
        ],
        matrix=matrix,
    )


@router.put(
    "/roles-matrix",
    response_model=RolesMatrixResponse,
    summary="Update roles-permissions matrix",
)
def update_roles_matrix(
    payload: UpdateRolesMatrixRequest,
    _: object = Depends(require_operations_reviews_access),
    db: Session = Depends(get_db),
) -> RolesMatrixResponse:
    for role_id_str, perm_ids in payload.matrix.items():
        try:
            role_id = int(role_id_str)
        except ValueError:
            continue

        role = db.get(Role, role_id)
        if not role:
            continue

        # Remove existing permissions for this role
        db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))

        # Add new permissions
        for pid in perm_ids:
            perm = db.get(Permission, pid)
            if perm:
                db.add(RolePermission(role_id=role_id, permission_id=pid))

    db.commit()
    return get_roles_matrix(_, db)


@router.put(
    "/users/{user_id}/role",
    summary="Assign role to a user",
)
def assign_user_role(
    user_id: int,
    payload: UpdateUserRoleRequest,
    _: object = Depends(require_operations_reviews_access),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    role: Role | None = None
    if payload.role_id:
        role = db.get(Role, payload.role_id)
    elif payload.role_name:
        role = db.scalar(select(Role).where(Role.name == payload.role_name.strip().lower()))

    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role specified")

    dept_id = payload.department_id or user.department_id or 1

    # Remove previous role assignments
    db.execute(delete(UserRole).where(UserRole.user_id == user.id))

    # Add new assignment
    db.add(UserRole(user_id=user.id, role_id=role.id, department_id=dept_id))
    db.commit()

    return {
        "success": True,
        "user_id": user.id,
        "role": role.name,
        "department_id": dept_id,
        "message": f"Assigned role '{role.name}' to {user.email}",
    }
