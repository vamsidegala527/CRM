# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Core Application & Security Settings
    DATABASE_URL: str = "postgresql://postgres:postgrespassword@localhost:5432/hr_db"
    SECRET_KEY: str = "antigravity_secret_key_hr_employee_management_2026_super_secure"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GOOGLE_CLIENT_ID: str = "64576092611-tlgd7s6jcubbtmk94ho741tjebvjdtbo.apps.googleusercontent.com"
    FRONTEND_URL: str = "http://localhost:3000"

    # Brevo Email Service (HTTPS API - Works 100% on Cloud & Render)
    BREVO_API_KEY: str = ""
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = "HR & Employee Management Portal"

    # Rate Limiter & Security Configuration
    REDIS_URL: str = ""
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_MAX_FAILURES: int = 20
    RATE_LIMIT_LOCKOUT_SECONDS: int = 30
    RATE_LIMIT_WINDOW_SECONDS: int = 180
    RATE_LIMIT_PUBLIC_RPM: int = 300
    RATE_LIMIT_PUBLIC_BURST: int = 100
    RATE_LIMIT_AUTH_USER_RPM: int = 600
    RATE_LIMIT_AUTH_USER_BURST: int = 150
    RATE_LIMIT_ADMIN_USER_RPM: int = 1200
    RATE_LIMIT_ADMIN_USER_BURST: int = 300

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
