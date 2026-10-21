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

    # ==================== 4. Rate Limiting & Proxy Security ====================
    REDIS_URL: str = ""
    RATE_LIMIT_ENABLED: bool = True
    INTERNAL_PROXY_SECRET: str = "crm_internal_proxy_secret_v2_2026"
    TRUSTED_PROXIES: str = "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

    # Login Abuse & Password Spraying Protection
    RATE_LIMIT_LOGIN_IP_MAX_REQUESTS: int = 300
    RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS: int = 60


    # Account Brute-Force Defense (Progressive Backoff)
    RATE_LIMIT_MAX_FAILURES: int = 25
    RATE_LIMIT_LOCKOUT_SECONDS: int = 30
    RATE_LIMIT_WINDOW_SECONDS: int = 180

    # User Token Buckets (Isolated per User ID)
    RATE_LIMIT_PUBLIC_RPM: int = 600
    RATE_LIMIT_PUBLIC_BURST: int = 200
    RATE_LIMIT_AUTH_USER_RPM: int = 1200
    RATE_LIMIT_AUTH_USER_BURST: int = 300
    RATE_LIMIT_ADMIN_USER_RPM: int = 2400
    RATE_LIMIT_ADMIN_USER_BURST: int = 600

    # Fail-Closed vs Fail-Open Policies
    RATE_LIMIT_FAIL_CLOSED_AUTH: bool = True

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
        """Warns if sensitive defaults are retained in production and validates rate limit parameters."""
        if self.is_production and "antigravity_secret_key" in self.SECRET_KEY:
            warnings.warn(
                "⚠️ [SECURITY WARNING] Using default SECRET_KEY in production! "
                "Please set a unique SECRET_KEY in your production environment variables.",
                RuntimeWarning,
            )

        # Rate Limit Parameter Validation (prevent negative, zero, or malformed limits)
        positive_fields = [
            ("RATE_LIMIT_LOGIN_IP_MAX_REQUESTS", self.RATE_LIMIT_LOGIN_IP_MAX_REQUESTS),
            ("RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS", self.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS),
            ("RATE_LIMIT_MAX_FAILURES", self.RATE_LIMIT_MAX_FAILURES),
            ("RATE_LIMIT_LOCKOUT_SECONDS", self.RATE_LIMIT_LOCKOUT_SECONDS),
            ("RATE_LIMIT_WINDOW_SECONDS", self.RATE_LIMIT_WINDOW_SECONDS),
            ("RATE_LIMIT_PUBLIC_RPM", self.RATE_LIMIT_PUBLIC_RPM),
            ("RATE_LIMIT_PUBLIC_BURST", self.RATE_LIMIT_PUBLIC_BURST),
            ("RATE_LIMIT_AUTH_USER_RPM", self.RATE_LIMIT_AUTH_USER_RPM),
            ("RATE_LIMIT_AUTH_USER_BURST", self.RATE_LIMIT_AUTH_USER_BURST),
            ("RATE_LIMIT_ADMIN_USER_RPM", self.RATE_LIMIT_ADMIN_USER_RPM),
            ("RATE_LIMIT_ADMIN_USER_BURST", self.RATE_LIMIT_ADMIN_USER_BURST),
        ]
        for name, val in positive_fields:
            if val is None or val <= 0:
                raise ValueError(f"Configuration error: '{name}' must be a strictly positive integer, got: {val}")

        return self


settings = Settings()

