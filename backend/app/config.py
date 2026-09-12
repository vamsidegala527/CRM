from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgrespassword@localhost:5432/customer_db"
    SECRET_KEY: str = "antigravity_secret_key_customer_management_2026_super_secure"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GOOGLE_CLIENT_ID: str = "64576092611-tlgd7s6jcubbtmk94ho741tjebvjdtbo.apps.googleusercontent.com"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
