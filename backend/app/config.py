import os
import warnings
# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict
# pyrefly: ignore [missing-import]
from pydantic import model_validator
from typing import Optional


class Settings(BaseSettings):
    # ==================== 1. Core & Environment Settings ====================
    ENVIRONMENT: str = "development"
    RENDER: bool = False
    DISABLE_DOCS: bool = False
    FRONTEND_URL: str = "http://localhost:3000"
    ALLOWED_ORIGINS: str = ""

    # ==================== 2. Security & JWT Configuration ====================
    DATABASE_URL: str = "postgresql://postgres:postgrespassword@localhost:5432/hr_db"
    SECRET_KEY: str = "antigravity_secret_key_hr_employee_management_2026_super_secure"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 Hours
    COOKIE_SECURE: Optional[bool] = None

    # ==================== 3. OAuth & Third-Party Integrations ====================
    GOOGLE_CLIENT_ID: str = "64576092611-tlgd7s6jcubbtmk94ho741tjebvjdtbo.apps.googleusercontent.com"
    BREVO_API_KEY: str = ""
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = "HR & Employee Management Portal"

    # ==================== 4. Rate Limiting & Account Defense ====================
    REDIS_URL: str = ""
    RATE_LIMIT_ENABLED: bool = True

    # Account Brute-Force Defense (3-minute window, 20 max failures, 30s cooldown)
    RATE_LIMIT_MAX_FAILURES: int = 20
    RATE_LIMIT_LOCKOUT_SECONDS: int = 30
    RATE_LIMIT_WINDOW_SECONDS: int = 180

    # User Token Buckets (Isolated per User ID)
    RATE_LIMIT_PUBLIC_RPM: int = 300
    RATE_LIMIT_PUBLIC_BURST: int = 100
    RATE_LIMIT_AUTH_USER_RPM: int = 600
    RATE_LIMIT_AUTH_USER_BURST: int = 150
    RATE_LIMIT_ADMIN_USER_RPM: int = 1200
    RATE_LIMIT_ADMIN_USER_BURST: int = 300

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        """Determines if the backend is running in production mode."""
        return (
            self.ENVIRONMENT.lower() in ("production", "prod")
            or self.RENDER is True
            or (self.COOKIE_SECURE is True)
        )

    @model_validator(mode="after")
    def validate_production_security(self):
        """Warns if sensitive defaults are retained in production."""
        if self.is_production and "antigravity_secret_key" in self.SECRET_KEY:
            warnings.warn(
                "⚠️ [SECURITY WARNING] Using default SECRET_KEY in production! "
                "Please set a unique SECRET_KEY in your production environment variables.",
                RuntimeWarning,
            )
        return self


settings = Settings()
