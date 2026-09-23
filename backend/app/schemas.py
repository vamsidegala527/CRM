import re
from datetime import datetime
from typing import Optional, List, Any
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, EmailStr, field_validator, model_validator, Field, ConfigDict
from app.validators import validate_email_strict


NAME_REGEX = re.compile(r"^[a-zA-Z0-9\s\-\'\.\,]+$")
PHONE_REGEX = re.compile(r"^\+?[0-9\s\-\(\)\.]{7,25}$")

def validate_phone_number(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not PHONE_REGEX.match(v):
        raise ValueError("Invalid phone number format. Allowed characters: digits, spaces, +, -, (), dot.")
    digits = re.sub(r"\D", "", v)
    if len(digits) < 7 or len(digits) > 15:
        raise ValueError(f"Phone number must contain between 7 and 15 digits (found {len(digits)}).")
    return v

def validate_name_string(v: str) -> str:
    if not isinstance(v, str):
        raise ValueError("Name must be a string.")
    v = v.strip()
    if not v:
        raise ValueError("Name cannot be empty or contain only whitespace.")
    if len(v) < 2:
        raise ValueError("Name must be at least 2 characters long.")
    if len(v) > 100:
        raise ValueError("Name cannot exceed 100 characters.")
    if not NAME_REGEX.match(v):
        raise ValueError("Name can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and commas.")
    return v


COMMON_WEAK_PASSWORDS = {
    "password", "password123", "12345678", "123456789", "qwerty123", "admin123",
    "welcome1", "letmein1", "iloveyou", "monkey123", "dragon123"
}

DANGEROUS_TAGS_REGEX = re.compile(
    r"(<\s*(script|iframe|object|embed|style|applet|meta|link|svg|img|video|audio|form|input|button)[^>]*>.*?</\s*\2\s*>|"
    r"<\s*(script|iframe|object|embed|style|applet|meta|link|svg|img|video|audio|form|input|button)[^>]*/>|"
    r"<\s*(script|iframe|object|embed|style|applet|meta|link|svg|img|video|audio|form|input|button)[^>]*>|"
    r"javascript\s*:|vbscript\s*:|data\s*:[^,]*,\s*<|"
    r"on[a-z]+\s*=)",
    re.IGNORECASE | re.DOTALL
)

def sanitize_input_text(v: Optional[str]) -> Optional[str]:
    """
    Sanitizes user input by stripping executable HTML/script injection tags,
    event handlers (onload, onerror), and neutralizing malicious payload characters.
    """
    if v is None:
        return None
    if not isinstance(v, str):
        return str(v)
    
    clean = v.strip()
    if not clean:
        return None
        
    prev = None
    while prev != clean:
        prev = clean
        clean = DANGEROUS_TAGS_REGEX.sub("", clean).strip()

    clean = clean.replace("<", "&lt;").replace(">", "&gt;")
    return clean

def validate_strong_password(v: str) -> str:
    v = v.strip()
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(v) > 72:
        raise ValueError("Password cannot exceed 72 characters.")
    return v

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_strict(v)

    @field_validator("full_name", mode="before")
    @classmethod
    def clean_full_name(cls, v: str) -> str:
        return validate_name_string(v)

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_strong_password(v)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_strict(v)

class GoogleAuthRequest(BaseModel):
    id_token: str

class VerifyEmailRequest(BaseModel):
    token: Optional[str] = None
    code: Optional[str] = None

    @field_validator("token", "code", mode="before")
    @classmethod
    def clean_str(cls, v: Any) -> Optional[str]:
        if isinstance(v, str):
            return v.strip()
        return v

class ResendVerificationRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_strict(v)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_strict(v)

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=72)
    confirm_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_strong_password(v)

    @model_validator(mode="after")
    def verify_password_match(self):
        if self.confirm_password is not None and self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match. Please confirm your new password.")
        return self

class UserResponse(UserBase):
    id: int
    public_id: Optional[str] = None
    is_active: bool
    is_verified: bool = False
    first_login: Optional[bool] = False
    login_count: Optional[int] = 0
    is_setup_complete: bool = False
    phone: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    emergency_contact: Optional[str] = None
    experience_years: Optional[str] = None
    previous_companies: Optional[str] = None
    previous_roles: Optional[str] = None
    skills: Optional[str] = None
    education: Optional[str] = None
    certifications: Optional[str] = None
    role: str = "admin"
    created_at: datetime
    google_id: Optional[str] = None
    auth_provider: Optional[str] = "email"
    setup_url: Optional[str] = None
    invitation_code: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

    @field_validator("full_name", mode="before")
    @classmethod
    def clean_full_name(cls, v: Any) -> str:
        return str(v).strip() if v is not None else ""

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None

class EmployeeCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    job_title: Optional[str] = Field(None, max_length=100)
    company: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=1000)
    phone: Optional[str] = Field(None, max_length=25)
    emergency_contact: Optional[str] = Field(None, max_length=100)
    experience_years: Optional[str] = Field(None, max_length=50)
    previous_companies: Optional[str] = Field(None, max_length=2000)
    previous_roles: Optional[str] = Field(None, max_length=2000)
    skills: Optional[str] = Field(None, max_length=2000)
    education: Optional[str] = Field(None, max_length=2000)
    certifications: Optional[str] = Field(None, max_length=2000)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_strict(v)

    @field_validator("full_name", mode="before")
    @classmethod
    def clean_full_name(cls, v: str) -> str:
        return validate_name_string(v)

    @field_validator("company", mode="before")
    @classmethod
    def clean_company(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("address", mode="before")
    @classmethod
    def clean_address(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("emergency_contact", "experience_years", "previous_companies", "previous_roles", "skills", "education", "certifications", mode="before")
    @classmethod
    def clean_career_fields(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = Field(None, max_length=100)
    job_title: Optional[str] = Field(None, max_length=100)
    company: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=1000)
    phone: Optional[str] = Field(None, max_length=25)
    is_active: Optional[bool] = None
    emergency_contact: Optional[str] = Field(None, max_length=100)
    experience_years: Optional[str] = Field(None, max_length=50)
    previous_companies: Optional[str] = Field(None, max_length=2000)
    previous_roles: Optional[str] = Field(None, max_length=2000)
    skills: Optional[str] = Field(None, max_length=2000)
    education: Optional[str] = Field(None, max_length=2000)
    certifications: Optional[str] = Field(None, max_length=2000)

    @field_validator("full_name", mode="before")
    @classmethod
    def clean_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_name_string(v)
        return v

    @field_validator("company", mode="before")
    @classmethod
    def clean_company(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("address", mode="before")
    @classmethod
    def clean_address(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("emergency_contact", "experience_years", "previous_companies", "previous_roles", "skills", "education", "certifications", mode="before")
    @classmethod
    def clean_career_fields(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

class EmployeeSelfUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=25)
    address: Optional[str] = Field(None, max_length=300)
    emergency_contact: Optional[str] = Field(None, max_length=100)
    experience_years: Optional[str] = Field(None, max_length=50)
    previous_companies: Optional[str] = Field(None, max_length=2000)
    previous_roles: Optional[str] = Field(None, max_length=2000)
    skills: Optional[str] = Field(None, max_length=2000)
    education: Optional[str] = Field(None, max_length=2000)
    certifications: Optional[str] = Field(None, max_length=2000)

    @field_validator("full_name", mode="before")
    @classmethod
    def clean_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_name_string(v)
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("address", mode="before")
    @classmethod
    def clean_address(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

    @field_validator("emergency_contact", "experience_years", "previous_companies", "previous_roles", "skills", "education", "certifications", mode="before")
    @classmethod
    def clean_career_fields(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            return v if v else None
        return v

class EmployeeSetupRequest(BaseModel):
    token: str = Field(..., min_length=1)
    email: EmailStr
    new_password: str = Field(..., min_length=8, max_length=72)
    confirm_password: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_strict(v)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_strong_password(v)

    @model_validator(mode="after")
    def verify_password_match(self):
        if self.confirm_password is not None and self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match. Please confirm your new password.")
        return self

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=72)
    confirm_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_strong_password(v)

    @model_validator(mode="after")
    def verify_password_match(self):
        if self.confirm_password is not None and self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match. Please confirm your new password.")
        return self


# ---------------------------------------------------------------------------
# Company Details Schemas
# ---------------------------------------------------------------------------

class CompanyDetailsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None

    # Identity & Branding
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    industry: Optional[str] = None
    company_type: Optional[str] = None
    founded_year: Optional[int] = None
    company_size: Optional[str] = None
    registration_number: Optional[str] = None

    # Location & Contact
    headquarters_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    contact_email: Optional[str] = None
    support_email: Optional[str] = None

    # Online Presence
    website_url: Optional[str] = None
    careers_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None

    # About & Culture
    about: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    core_values: Optional[str] = None
    culture_description: Optional[str] = None

    # Business Details
    annual_revenue: Optional[str] = None
    products_services: Optional[str] = None
    key_clients: Optional[str] = None
    certifications: Optional[str] = None
    awards: Optional[str] = None

    # Workplace Policies & Benefits
    work_model: Optional[str] = None
    working_hours: Optional[str] = None
    leave_policy_summary: Optional[str] = None
    benefits_summary: Optional[str] = None
    workplace_guidelines: Optional[str] = None

    # Leadership & Key Contacts
    executive_leadership: Optional[str] = None
    hr_contact_email: Optional[str] = None
    it_support_email: Optional[str] = None
    finance_email: Optional[str] = None
    emergency_contact: Optional[str] = None

    @field_validator(
        "contact_email", "support_email", "hr_contact_email", "it_support_email", "finance_email",
        mode="before"
    )
    @classmethod
    def clean_company_emails(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            return validate_email_strict(v)
        return v

    updated_at: Optional[datetime] = None


class CompanyDetailsUpdate(BaseModel):
    # Identity & Branding
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    industry: Optional[str] = None
    company_type: Optional[str] = None
    founded_year: Optional[int] = None
    company_size: Optional[str] = None
    registration_number: Optional[str] = None

    # Location & Contact
    headquarters_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    contact_email: Optional[str] = None
    support_email: Optional[str] = None

    # Online Presence
    website_url: Optional[str] = None
    careers_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None

    # About & Culture
    about: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    core_values: Optional[str] = None
    culture_description: Optional[str] = None

    # Business Details
    annual_revenue: Optional[str] = None
    products_services: Optional[str] = None
    key_clients: Optional[str] = None
    certifications: Optional[str] = None
    awards: Optional[str] = None

    # Workplace Policies & Benefits
    work_model: Optional[str] = None
    working_hours: Optional[str] = None
    leave_policy_summary: Optional[str] = None
    benefits_summary: Optional[str] = None
    workplace_guidelines: Optional[str] = None

    # Leadership & Key Contacts
    executive_leadership: Optional[str] = None
    hr_contact_email: Optional[str] = None
    it_support_email: Optional[str] = None
    finance_email: Optional[str] = None
    emergency_contact: Optional[str] = None

    @field_validator(
        "contact_email", "support_email", "hr_contact_email", "it_support_email", "finance_email",
        mode="before"
    )
    @classmethod
    def clean_update_company_emails(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            return validate_email_strict(v)
        return v
