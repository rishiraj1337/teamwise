import re
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

EmployeeId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Password = Annotated[str, StringConstraints(min_length=12, max_length=128)]
UserText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


def validate_password_strength(value: str) -> str:
    requirements = (
        any(char.islower() for char in value),
        any(char.isupper() for char in value),
        any(char.isdigit() for char in value),
        any(not char.isalnum() for char in value),
    )
    if not all(requirements):
        raise ValueError(
            "Password must include lowercase, uppercase, numeric, and special characters"
        )
    return value


class UserRegister(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "emp_id": "NP1001",
                "email": "alex@example.com",
                "password": "SecurePassword1!",
                "name": "Alex Employee",
                "department_id": 1,
                "role_id": 1,
                "job_title": "Software Engineer",
                "mobile_number": "+14155550123",
            }
        },
    )

    emp_id: EmployeeId
    email: EmailStr
    password: Password
    name: UserText
    department_id: int = Field(gt=0)
    role_id: int = Field(gt=0)
    job_title: UserText
    mobile_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=7, max_length=16)]

    @field_validator("emp_id")
    @classmethod
    def validate_emp_id(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not re.fullmatch(r"NP\d{4}", normalized):
            raise ValueError("Employee ID must be NP followed by 4 digits (for example, NP1001)")
        return normalized

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()

    @field_validator("password")
    @classmethod
    def validate_registration_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile_number(cls, value: str) -> str:
        if not re.fullmatch(r"\+?[0-9]{7,15}", value):
            raise ValueError("Enter 7 to 15 digits, optionally prefixed by +")
        return value


class UserLogin(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "alex@example.com",
                "password": "SecurePassword1!",
            }
        }
    )

    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()


class UserPublic(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "emp_id": "NP1001",
                "email": "alex@example.com",
                "name": "Alex Employee",
                "department_id": 1,
                "role": "employee",
                "job_title": "Software Engineer",
                "mobile_number": "+14155550123",
                "permissions": ["workspace:read", "reviews:read"],
            }
        },
    )

    emp_id: str
    email: EmailStr
    name: str
    department_id: int
    department: str
    role: str
    job_title: str
    mobile_number: str
    permissions: list[str] = Field(default_factory=list)
