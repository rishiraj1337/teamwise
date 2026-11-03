from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_operations_reviews_access
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.admin_users import TeamwiseUserSummary, TeamwiseUsersListResponse
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
