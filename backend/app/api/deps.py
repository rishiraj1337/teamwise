import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from collections.abc import Callable

from app.core.config import get_settings
from app.core.departments import OPERATIONS_DEPARTMENT_ID
from app.db.session import get_db
from app.models import Department, User
from app.services.rbac import user_has_permission

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.InvalidTokenError:
        raise unauthorized from None

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise unauthorized

    user = db.scalar(select(User).where(User.emp_id == subject))
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_permission(resource: str, action: str) -> Callable[..., User]:
    def _dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not user_has_permission(db, current_user, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return _dependency


def _user_is_operations(db: Session, user: User) -> bool:
    if user.department_id == OPERATIONS_DEPARTMENT_ID:
        return True
    department = db.get(Department, user.department_id)
    return department is not None and department.code == "operations"


def require_operations_reviews_access(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not _user_is_operations(db, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reviews and remarks are available only to the Operations department",
        )
    return current_user
