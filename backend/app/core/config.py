from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mysql_database: str = "teamwisedb"
    mysql_user: str = "teamwise"
    mysql_password: SecretStr
    mysql_host: str = "127.0.0.1"
    mysql_port: int = Field(default=3307, ge=1, le=65535)

    review_mysql_database: str = "timePayReview"
    review_mysql_user: str = "root"
    review_mysql_password: SecretStr | None = None
    review_mysql_host: str = "127.0.0.1"
    review_mysql_port: int = Field(default=3306, ge=1, le=65535)
    jwt_secret_key: SecretStr
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0)
    cors_origins: str = "http://localhost:5173"

    zeptomail_api_url: str = "https://cpaas.zoho.in/v1.1/email"
    zeptomail_api_key: SecretStr | None = None
    zeptomail_from_address: str = "noreply@npstx.com"
    zeptomail_from_name: str = "Teamwise"
    frontend_base_url: str = "http://localhost:5173"
    password_reset_token_minutes: int = Field(default=60, gt=0)

    app_env: str = "development"
    allow_public_registration: bool = True
    auth_rate_limit_per_minute: int = Field(default=20, ge=0, le=500)
    login_max_failures: int = Field(default=3, ge=1, le=20)
    login_failure_window_minutes: int = Field(default=3, ge=1, le=60)
    login_lockout_minutes: int = Field(default=60, ge=1, le=24 * 60)

    enterprise_api_url: str = "http://127.0.0.1:3000"
    enterprise_bridge_email: str | None = None
    enterprise_bridge_password: SecretStr | None = None

    @property
    def enterprise_bridge_configured(self) -> bool:
        return bool(
            self.enterprise_bridge_email
            and self.enterprise_bridge_password is not None
            and self.enterprise_bridge_password.get_secret_value().strip()
        )

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() == "production"

    @property
    def zeptomail_configured(self) -> bool:
        return self.zeptomail_api_key is not None and bool(
            self.zeptomail_api_key.get_secret_value().strip()
        )

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters")
        return value

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password.get_secret_value(),
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database,
            query={"charset": "utf8mb4"},
        )

    @property
    def review_database_url(self) -> URL:
        review_password = (
            self.review_mysql_password.get_secret_value()
            if self.review_mysql_password is not None
            else ""
        )
        password = review_password or self.mysql_password.get_secret_value()
        return URL.create(
            drivername="mysql+pymysql",
            username=self.review_mysql_user,
            password=password,
            host=self.review_mysql_host,
            port=self.review_mysql_port,
            database=self.review_mysql_database,
            query={"charset": "utf8mb4"},
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

