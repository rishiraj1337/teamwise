import html

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PasswordResetToken, User
from app.services.email import (
    EmailDeliveryError,
    EmailRecipient,
    generate_otp_code,
    hash_reset_token,
    send_html_email,
)

FORGOT_PASSWORD_MESSAGE = (
    "If an account exists for that email, you will receive a one-time code shortly."
)


def _normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get_user_by_email(db: Session, email: str) -> User | None:
    normalized = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized))
    if user is None or not user.is_active:
        return None
    return user


def _get_valid_reset_row(db: Session, user_id: int, otp: str) -> PasswordResetToken | None:
    otp_clean = otp.strip()
    if len(otp_clean) != 6 or not otp_clean.isdigit():
        return None

    now = datetime.now(timezone.utc)
    row = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.token_hash == hash_reset_token(otp_clean),
            PasswordResetToken.used_at.is_(None),
        )
    )
    if row is None:
        return None
    if _normalize_utc(row.expires_at) <= now:
        return None
    return row


def request_password_reset(db: Session, email: str) -> str:
    user = _get_user_by_email(db, email)
    if user is None:
        return FORGOT_PASSWORD_MESSAGE

    settings = get_settings()
    if not settings.zeptomail_configured:
        raise EmailDeliveryError("Email is not configured on the server.")

    otp = generate_otp_code()
    now = datetime.now(timezone.utc)
    token_row = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_reset_token(otp),
        expires_at=now + timedelta(minutes=settings.password_reset_token_minutes),
        created_at=now,
    )
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    db.add(token_row)
    db.commit()

    safe_name = html.escape(user.name)
    html_body = (
        f"<div style=\"font-family:sans-serif;line-height:1.6;color:#252438\">"
        f"<p>Hi {safe_name},</p>"
        f"<p>You requested to reset your <b>Teamwise</b> password.</p>"
        f"<p>Your one-time verification code is:</p>"
        f"<p style=\"font-size:28px;letter-spacing:6px;font-weight:700;color:#5c41c2\">{otp}</p>"
        f"<p>This code expires in {settings.password_reset_token_minutes} minutes. "
        f"Enter it on the password reset screen in Teamwise.</p>"
        f"<p>If you did not request this, you can safely ignore this email.</p>"
        f"</div>"
    )

    send_html_email(
        api_url=settings.zeptomail_api_url,
        api_key=settings.zeptomail_api_key.get_secret_value(),  # type: ignore[union-attr]
        from_address=settings.zeptomail_from_address,
        from_name=settings.zeptomail_from_name,
        to=EmailRecipient(address=user.email, name=user.name),
        subject="Your Teamwise password reset code",
        html_body=html_body,
    )
    return FORGOT_PASSWORD_MESSAGE


def verify_reset_otp(db: Session, email: str, otp: str) -> None:
    user = _get_user_by_email(db, email)
    if user is None:
        raise ValueError("Invalid or expired code.")

    if _get_valid_reset_row(db, user.id, otp) is None:
        raise ValueError("Invalid or expired code. Request a new code from the sign-in page.")


def reset_password_with_otp(db: Session, email: str, otp: str, new_password: str) -> None:
    user = _get_user_by_email(db, email)
    if user is None:
        raise ValueError("Invalid or expired code.")

    row = _get_valid_reset_row(db, user.id, otp)
    if row is None:
        raise ValueError("Invalid or expired code. Request a new code from the sign-in page.")

    from app.core.security import hash_password

    now = datetime.now(timezone.utc)
    user.password = hash_password(new_password)
    row.used_at = now
    db.commit()
