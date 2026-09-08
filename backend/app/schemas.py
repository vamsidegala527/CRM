from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None


# Customer Schemas
class CustomerBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = "Active"
    notes: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True

class CustomerListResponse(BaseModel):
    total: int
    items: List[CustomerResponse]
    page: int
    limit: int
