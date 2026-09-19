import uuid
import datetime
# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String, unique=True, index=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=True)
    google_id = Column(String, unique=True, index=True, nullable=True)
    auth_provider = Column(String, default="email", nullable=False)
    role = Column(String, default="admin", nullable=False)  # "admin" | "employee"
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    first_login = Column(Boolean, default=True, nullable=False)
    login_count = Column(Integer, default=0, nullable=False)
    is_setup_complete = Column(Boolean, default=False, nullable=False)
    phone = Column(String, nullable=True)
    department = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    company = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    setup_token_hash = Column(String, nullable=True, index=True)
    setup_token_expires = Column(DateTime, nullable=True)
    verification_token = Column(String, nullable=True, index=True)
    verification_token_expires = Column(DateTime, nullable=True)
    reset_password_token = Column(String, nullable=True, index=True)
    reset_password_expires = Column(DateTime, nullable=True)
    token_revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class CompanyDetails(Base):
    """Single-row table storing company profile information.
    Only one record (id=1) is ever created; admin upserts it."""
    __tablename__ = "company_details"

    id = Column(Integer, primary_key=True, default=1)

    # --- Identity & Branding ---
    company_name = Column(String, nullable=True)
    tagline = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    company_type = Column(String, nullable=True)   # Private | Public | Non-profit | Startup
    founded_year = Column(Integer, nullable=True)
    company_size = Column(String, nullable=True)   # e.g. "50-200"
    registration_number = Column(String, nullable=True)

    # --- Location & Contact ---
    headquarters_address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    fax = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    support_email = Column(String, nullable=True)

    # --- Online Presence ---
    website_url = Column(String, nullable=True)
    careers_url = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    twitter_url = Column(String, nullable=True)
    instagram_url = Column(String, nullable=True)
    facebook_url = Column(String, nullable=True)

    # --- About & Culture ---
    about = Column(Text, nullable=True)
    mission = Column(Text, nullable=True)
    vision = Column(Text, nullable=True)
    core_values = Column(Text, nullable=True)
    culture_description = Column(Text, nullable=True)

    # --- Business Details ---
    annual_revenue = Column(String, nullable=True)
    products_services = Column(Text, nullable=True)
    key_clients = Column(Text, nullable=True)
    certifications = Column(Text, nullable=True)
    awards = Column(Text, nullable=True)

    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
