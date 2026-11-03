from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.schemas.user import Password, UserPublic, validate_password_strength


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()


class ForgotPasswordResponse(BaseModel):
    message: str = Field(
        default="If an account exists for that email, you will receive a one-time code shortly."
    )


class VerifyResetOtpRequest(BaseModel):
    email: EmailStr
    otp: Annotated[str, Field(min_length=6, max_length=6, pattern=r"^\d{6}$")]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: Annotated[str, Field(min_length=6, max_length=6, pattern=r"^\d{6}$")]
    new_password: Password
    confirm_new_password: Password

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()

    @model_validator(mode="after")
    def validate_passwords(self) -> "ResetPasswordRequest":
        validate_password_strength(self.new_password)
        if self.new_password != self.confirm_new_password:
            raise ValueError("New password and confirmation do not match")
        return self


class TokenResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "<JWT access token>",
                "token_type": "bearer",
                "user": {
                    "emp_id": "TW-1001",
                    "email": "alex@example.com",
                    "name": "Alex Employee",
                    "department": "Engineering",
                    "role": "employee",
                    "job_title": "Software Engineer",
                    "mobile_number": "+14155550123",
                },
            }
        }
    )

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "current_password": "SecurePassword1!",
                "new_password": "NewSecurePassword1!",
                "confirm_new_password": "NewSecurePassword1!",
            }
        }
    )

    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Password
    confirm_new_password: Password

    @model_validator(mode="after")
    def validate_new_passwords(self) -> "ChangePasswordRequest":
        validate_password_strength(self.new_password)
        if self.new_password != self.confirm_new_password:
            raise ValueError("New password and confirmation do not match")
        return self
