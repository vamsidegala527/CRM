from app.database import SessionLocal, engine, Base

def seed_database():
    """Ensure database tables exist. No mock/demo data is seeded."""
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized successfully. Clean state maintained (no demo data).")

if __name__ == "__main__":
    seed_database()
