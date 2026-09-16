from sqlalchemy import create_engine
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
    from sqlalchemy import text
    import uuid
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR DEFAULT 'email';"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'user';"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR;"))
            conn.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id);"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id);"))

            # Customer migrations
            conn.execute(text("ALTER TABLE customers ADD COLUMN IF NOT EXISTS public_id VARCHAR;"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_public_id ON customers (public_id);"))

            # Backfill missing public_ids for users and customers
            user_rows = conn.execute(text("SELECT id FROM users WHERE public_id IS NULL;")).fetchall()
            for r in user_rows:
                conn.execute(text("UPDATE users SET public_id = :pid WHERE id = :id;"), {"pid": str(uuid.uuid4()), "id": r[0]})

            cust_rows = conn.execute(text("SELECT id FROM customers WHERE public_id IS NULL;")).fetchall()
            for r in cust_rows:
                conn.execute(text("UPDATE customers SET public_id = :pid WHERE id = :id;"), {"pid": str(uuid.uuid4()), "id": r[0]})

            conn.commit()
    except Exception as e:
        print(f"Database schema sync notice: {e}")
