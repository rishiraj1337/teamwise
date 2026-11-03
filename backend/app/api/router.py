from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth_rate_limit import client_ip, rate_limit_key
from app.api.deps import get_current_user
from app.api.admin_users import router as admin_users_router
from app.api.review_config import router as review_config_router
from app.api.audit import router as audit_router
from app.api.platform_bridge import router as platform_bridge_router
from app.api.reviews import router as reviews_router
from app.services.audit import record_audit
from app.core.config import get_settings
from app.core.login_lockout import assert_login_allowed, clear_login_lockout, record_failed_login
from app.core.rate_limit import enforce_rate_limit
from app.services.email import EmailDeliveryError
from app.services.password_reset import request_password_reset, reset_password_with_otp, verify_reset_otp
from app.services.users import assign_role, build_user_public
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Department, Role, User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    TokenResponse,
    VerifyResetOtpRequest,
)
from app.schemas.rbac import DepartmentOption, RegistrationOptionsResponse, RoleOption
from app.schemas.user import UserLogin, UserPublic, UserRegister

router = APIRouter()
router.include_router(reviews_router)
router.include_router(review_config_router)
router.include_router(admin_users_router)
router.include_router(audit_router)
router.include_router(platform_bridge_router)


def _auth_rate_limit(request: Request, scope: str, identity: str) -> None:
    settings = get_settings()
    enforce_rate_limit(
        rate_limit_key(scope, client_ip(request), identity),
        max_events=settings.auth_rate_limit_per_minute,
    )


@router.get(
    "/auth/registration-options",
    response_model=RegistrationOptionsResponse,
    summary="Departments and roles for the registration form",
)
def registration_options(db: Session = Depends(get_db)) -> RegistrationOptionsResponse:
    departments = db.scalars(select(Department).order_by(Department.name)).all()
    roles = db.scalars(select(Role).order_by(Role.name)).all()
    return RegistrationOptionsResponse(
        departments=[DepartmentOption.model_validate(item) for item in departments],
        roles=[RoleOption.model_validate(item) for item in roles],
    )


@router.post(
    "/auth/register",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Register an employee account",
)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)) -> UserPublic:
    settings = get_settings()
    if not settings.allow_public_registration:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled. Contact your administrator.",
        )
    _auth_rate_limit(request, "register", payload.email)
    existing_user = db.scalar(
        select(User).where((User.emp_id == payload.emp_id) | (User.email == payload.email))
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this employee ID or email already exists",
        )

    department = db.get(Department, payload.department_id)
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select a valid department",
        )
    role = db.get(Role, payload.role_id)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select a valid role",
        )

    user = User(
        emp_id=payload.emp_id,
        email=payload.email,
        password=hash_password(payload.password),
        name=payload.name,
        department_id=department.id,
        is_active=True,
        job_title=payload.job_title,
        mobile_number=payload.mobile_number,
    )
    db.add(user)
    try:
        db.flush()
        assign_role(db, user, role.name, department.id)
        db.commit()
    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this employee ID or email already exists",
        ) from None
    db.refresh(user)
    record_audit(
        db,
        action="auth.register",
        resource_type="user",
        resource_id=user.emp_id,
        summary=f"Registered account {user.email}",
        actor=user,
        request=request,
    )
    return build_user_public(db, user)


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    summary="Log in and receive an access token",
)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    _auth_rate_limit(request, "login", payload.email)
    try:
        assert_login_allowed(str(payload.email))
    except HTTPException as lockout:
        record_audit(
            db,
            action="auth.login.lockout",
            resource_type="user",
            summary=f"Sign-in blocked for {payload.email}",
            actor_email=str(payload.email),
            metadata={"detail": str(lockout.detail)},
            request=request,
        )
        raise
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password):
        record_failed_login(
            str(payload.email),
            max_failures=settings.login_max_failures,
            window_seconds=settings.login_failure_window_minutes * 60,
            lockout_seconds=settings.login_lockout_minutes * 60,
        )
        record_audit(
            db,
            action="auth.login.failure",
            resource_type="user",
            summary=f"Failed sign-in for {payload.email}",
            actor_email=str(payload.email),
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clear_login_lockout(str(payload.email))
    record_audit(
        db,
        action="auth.login.success",
        resource_type="user",
        resource_id=user.emp_id,
        summary=f"Signed in {user.email}",
        actor=user,
        request=request,
    )
    return TokenResponse(
        access_token=create_access_token(user.emp_id),
        user=build_user_public(db, user),
    )


@router.get(
    "/auth/me",
    response_model=UserPublic,
    summary="Get the authenticated employee profile",
)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    return build_user_public(db, current_user)


@router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out and record an audit event",
)
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    record_audit(
        db,
        action="auth.logout",
        resource_type="user",
        resource_id=current_user.emp_id,
        summary=f"Signed out {current_user.email}",
        actor=current_user,
        request=request,
    )


@router.post(
    "/auth/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change password for the signed-in user",
)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(payload.current_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    if verify_password(payload.new_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be different from the current password",
        )

    current_user.password = hash_password(payload.new_password)
    db.commit()
    record_audit(
        db,
        action="auth.change_password",
        resource_type="user",
        resource_id=current_user.emp_id,
        summary=f"Changed password for {current_user.email}",
        actor=current_user,
        request=request,
    )


@router.post(
    "/auth/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Request a password reset email",
)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    _auth_rate_limit(request, "forgot-password", str(payload.email))
    try:
        message = request_password_reset(db, str(payload.email))
    except EmailDeliveryError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send reset email. Try again later.",
        ) from error
    record_audit(
        db,
        action="auth.forgot_password",
        resource_type="user",
        summary=f"Password reset requested for {payload.email}",
        actor_email=str(payload.email),
        request=request,
    )
    return ForgotPasswordResponse(message=message)


@router.post(
    "/auth/verify-reset-otp",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Verify a password reset OTP before setting a new password",
)
def verify_reset_otp_route(
    payload: VerifyResetOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    _auth_rate_limit(request, "verify-reset-otp", str(payload.email))
    try:
        verify_reset_otp(db, str(payload.email), payload.otp)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    record_audit(
        db,
        action="auth.verify_reset_otp",
        resource_type="user",
        summary=f"Verified reset OTP for {payload.email}",
        actor_email=str(payload.email),
        request=request,
    )


@router.post(
    "/auth/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set a new password using a reset token",
)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)) -> None:
    _auth_rate_limit(request, "reset-password", str(payload.email))
    try:
        reset_password_with_otp(
            db,
            str(payload.email),
            payload.otp,
            payload.new_password,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    user = db.scalar(select(User).where(User.email == payload.email))
    record_audit(
        db,
        action="auth.reset_password",
        resource_type="user",
        resource_id=user.emp_id if user is not None else None,
        summary=f"Password reset completed for {payload.email}",
        actor=user,
        actor_email=str(payload.email) if user is None else None,
        request=request,
    )
