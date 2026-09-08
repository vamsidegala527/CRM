import re
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator, Field, ConfigDict

VALID_STATUSES = {"Active", "Lead", "Prospect", "Inactive"}
PHONE_REGEX = re.compile(r"^\+?[0-9\s\-\(\)\.]{7,20}$")

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
        return v

    @field_validator("full_name", mode="before")
    @classmethod
    def clean_full_name(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip()
            if len(v) < 2:
                raise ValueError("Full name must be at least 2 characters long.")
        return v

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        if len(v) > 72:
            raise ValueError("Password cannot exceed 72 characters.")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip().lower()
        return v

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

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
                raise ValueError("Customer email cannot be empty.")
        return v

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip()
            if len(v) < 2:
                raise ValueError("Customer name must be at least 2 characters long.")
        return v

    @field_validator("company", "address", "notes", mode="before")
    @classmethod
    def clean_optional_strings(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> str:
        if not v:
            return "Active"
        v = v.strip().capitalize()
        if v not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{v}'. Allowed values: {', '.join(sorted(VALID_STATUSES))}.")
        return v

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
            return v if v else None
        return v

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if v and len(v) < 2:
                raise ValueError("Customer name must be at least 2 characters long.")
            return v if v else None
        return v

    @field_validator("company", "address", "notes", mode="before")
    @classmethod
    def clean_optional_strings(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_phone_number(v)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().capitalize()
        if v not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{v}'. Allowed values: {', '.join(sorted(VALID_STATUSES))}.")
        return v

class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    owner_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class CustomerListResponse(BaseModel):
    total: int
    items: List[CustomerResponse]
    page: int
    limit: int
