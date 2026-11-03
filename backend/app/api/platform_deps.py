from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import _user_is_operations, get_current_user
from app.db.session import get_db
from app.models import User
from app.services.rbac import user_has_permission


def _forbidden(message: str = "You do not have permission to perform this action") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"success": False, "code": "FORBIDDEN", "message": message, "details": None},
    )


def require_platform_authenticated(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


def require_platform_reviews_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if _user_is_operations(db, current_user):
        return current_user
    if user_has_permission(db, current_user, "reviews", "read"):
        return current_user
    raise _forbidden("Reviews require the reviews:read permission or Operations department access")


def require_platform_reviews_write(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if _user_is_operations(db, current_user):
        return current_user
    if user_has_permission(db, current_user, "reviews", "write"):
        return current_user
    raise _forbidden("Updating reviews requires reviews:write or Operations department access")


def require_platform_reviews_export(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if _user_is_operations(db, current_user):
        return current_user
    if user_has_permission(db, current_user, "reviews", "export"):
        return current_user
    raise _forbidden("Export requires reviews:export or Operations department access")


def require_platform_audit_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if _user_is_operations(db, current_user):
        return current_user
    if user_has_permission(db, current_user, "audit", "read"):
        return current_user
    raise _forbidden("Audit logs require audit:read or Operations department access")
