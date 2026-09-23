# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def sync_db_schema():
    # pyrefly: ignore [missing-import]
    from sqlalchemy import text
    import uuid
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR DEFAULT 'email';"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'admin';"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_setup_complete BOOLEAN;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_years VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_companies TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_roles TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS education TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS certifications TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_token_hash VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_token_expires TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR;"))
            conn.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id);"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_setup_token_hash ON users (setup_token_hash);"))

            # Safe backfill for existing records
            conn.execute(text("UPDATE users SET is_setup_complete = TRUE WHERE is_setup_complete IS NULL;"))
            conn.execute(text("UPDATE users SET role = 'admin' WHERE role = 'user' OR role IS NULL;"))
            conn.execute(text("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'admin';"))
            conn.execute(text("ALTER TABLE users ALTER COLUMN is_setup_complete SET DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE users ALTER COLUMN is_setup_complete SET NOT NULL;"))

            # Company Details schema sync
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS work_model VARCHAR;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS working_hours VARCHAR;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS leave_policy_summary TEXT;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS benefits_summary TEXT;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS workplace_guidelines TEXT;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS executive_leadership TEXT;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS hr_contact_email VARCHAR;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS it_support_email VARCHAR;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS finance_email VARCHAR;"))
            conn.execute(text("ALTER TABLE company_details ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR;"))

            # Safely drop legacy customers table if present
            conn.execute(text("DROP TABLE IF EXISTS customers CASCADE;"))

            conn.commit()
    except Exception as e:
        print(f"Database schema sync notice: {e}")
