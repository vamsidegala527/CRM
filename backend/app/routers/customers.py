from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.database import get_db
from app.models import Customer, User
from app.schemas import CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/customers", tags=["Customer Management"])

@router.get("", response_model=CustomerListResponse)
def get_customers(
    search: Optional[str] = Query(None, description="Search term for name, email, company, or phone"),
    status: Optional[str] = Query(None, description="Filter by customer status (Active, Lead, Prospect, Inactive)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Customer)

    # Scoping: Normal users only see their own customer records
    if current_user.role != "admin":
        query = query.filter(Customer.owner_id == current_user.id)

    # Filter by search string across fields
    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.name.ilike(search_pattern),
                Customer.email.ilike(search_pattern),
                Customer.company.ilike(search_pattern),
                Customer.phone.ilike(search_pattern)
            )
        )

    # Filter by status if provided and not "All"
    if status and status.strip() and status.strip() != "All":
        clean_status = status.strip().capitalize()
        query = query.filter(Customer.status == clean_status)

    total = query.count()
    offset = (page - 1) * limit
    customers = query.order_by(Customer.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": customers,
        "page": page,
        "limit": limit
    }


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer_by_id(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if customer_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer ID. Must be a positive integer."
        )

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} not found."
        )

    # Ownership check: Normal users can only access their own records
    if current_user.role != "admin" and customer.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You do not own this customer record."
        )

    return customer


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    customer_in: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    email_clean = customer_in.email.strip().lower()

    # Duplicate check for customer email
    existing = db.query(Customer).filter(func.lower(Customer.email) == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A customer with the email address '{email_clean}' already exists."
        )

    customer_data = customer_in.model_dump()
    customer_data["email"] = email_clean

    new_customer = Customer(
        **customer_data,
        owner_id=current_user.id
    )
    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)
    return new_customer


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int,
    customer_in: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if customer_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer ID. Must be a positive integer."
        )

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} not found."
        )

    # Ownership check: Normal users can only modify their own records
    if current_user.role != "admin" and customer.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot modify another user's customer record."
        )

    update_data = customer_in.model_dump(exclude_unset=True)

    # Check for email duplicate if email is being modified
    if "email" in update_data and update_data["email"]:
        new_email = update_data["email"].strip().lower()
        if new_email != customer.email.lower():
            existing = db.query(Customer).filter(func.lower(Customer.email) == new_email).first()
            if existing and existing.id != customer_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A customer with the email address '{new_email}' already exists."
                )
        update_data["email"] = new_email

    for field, value in update_data.items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_200_OK)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if customer_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer ID. Must be a positive integer."
        )

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} not found."
        )

    # Ownership check: Normal users can only delete their own records
    if current_user.role != "admin" and customer.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot delete another user's customer record."
        )

    db.delete(customer)
    db.commit()
    return {"message": f"Customer with ID {customer_id} deleted successfully."}
