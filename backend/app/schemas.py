import re
from datetime import datetime
from typing import Optional, List, Any
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, EmailStr, field_validator, model_validator, Field, ConfigDict

VALID_STATUSES = {"Active", "Lead", "Prospect", "Inactive"}
STATUS_MAP = {
    "ACTIVE CUSTOMER": "Active",
    "SALES LEAD": "Lead",
    "PROSPECT": "Prospect",
    "INACTIVE": "Inactive",
    "ACTIVE": "Active",
    "LEAD": "Lead",
}

NAME_REGEX = re.compile(r"^[a-zA-Z\s\-\'\.\,]+$")
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
        raise ValueError("Name can only contain letters, spaces, hyphens, apostrophes, periods, and commas.")
    return v

def normalize_status(v: Optional[str]) -> str:
    if not v or not v.strip():
        return "Active"
    clean = v.strip().upper()
    if clean in STATUS_MAP:
        return STATUS_MAP[clean]
    cap = v.strip().capitalize()
    if cap in VALID_STATUSES:
        return cap
    raise ValueError(f"Invalid status '{v}'. Allowed values: Active Customer, Sales Lead, Prospect, Inactive.")

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
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter (A-Z).")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter (a-z).")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one number (0-9).")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_=+[\]\\/;~`]", v):
        raise ValueError("Password must contain at least one special character (e.g. !@#$%^&*).")
    if v.lower() in COMMON_WEAK_PASSWORDS:
        raise ValueError("Password is too common and insecure. Please choose a stronger password.")
    return v

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip().lower()
            if not v:
                raise ValueError("Email cannot be empty.")
            if len(v) > 255:
                raise ValueError("Email address cannot exceed 255 characters.")
        return v

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
        if isinstance(v, str):
            return v.strip().lower()
        return v

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

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

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
    role: str = "user"
    created_at: datetime
    google_id: Optional[str] = None
    auth_provider: Optional[str] = "email"

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None


# Customer Schemas
class CustomerBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=25)
    company: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = Field(None, max_length=300)
    status: Optional[str] = "Active"
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip().lower()
            if not v:
                raise ValueError("Customer email address cannot be empty.")
            if len(v) > 255:
                raise ValueError("Email address cannot exceed 255 characters.")
        return v

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return validate_name_string(v)

    @field_validator("company", mode="before")
    @classmethod
    def clean_company(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            if not v:
                return None
            if len(v) > 100:
                raise ValueError("Company name cannot exceed 100 characters.")
            return v
        return v

    @field_validator("address", mode="before")
    @classmethod
    def clean_address(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            if not v:
                return None
            if len(v) > 300:
                raise ValueError("Address cannot exceed 300 characters.")
            return v
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            if not v:
                return None
            if len(v) > 1000:
                raise ValueError("Notes cannot exceed 1000 characters.")
            return v
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> str:
        return normalize_status(v)

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=25)
    company: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = Field(None, max_length=300)
    status: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip().lower()
            if not v:
                return None
            if len(v) > 255:
                raise ValueError("Email address cannot exceed 255 characters.")
            return v
        return v

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            return validate_name_string(v)
        return v

    @field_validator("company", mode="before")
    @classmethod
    def clean_company(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            if not v:
                return None
            if len(v) > 100:
                raise ValueError("Company name cannot exceed 100 characters.")
            return v
        return v

    @field_validator("address", mode="before")
    @classmethod
    def clean_address(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            if not v:
                return None
            if len(v) > 300:
                raise ValueError("Address cannot exceed 300 characters.")
            return v
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = sanitize_input_text(v)
            if not v:
                return None
            if len(v) > 1000:
                raise ValueError("Notes cannot exceed 1000 characters.")
            return v
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_status(v)

class CustomerResponse(CustomerBase):
    id: int
    public_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    owner_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class CustomerListResponse(BaseModel):
    total: int
    items: List[CustomerResponse]
    page: int
    limit: int
