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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
