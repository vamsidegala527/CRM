from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models import Customer, User
from app.schemas import CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/customers", tags=["Customer Management"])

@router.get("", response_model=CustomerListResponse)
def get_customers(
    search: Optional[str] = Query(None, description="Search term for name, email, or company"),
    status: Optional[str] = Query(None, description="Filter by customer status (Active, Lead, Prospect, Inactive)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Customer)

    # Filter by search string (name, email, company)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Customer.name.ilike(search_pattern),
                Customer.email.ilike(search_pattern),
                Customer.company.ilike(search_pattern),
                Customer.phone.ilike(search_pattern)
            )
        )

    # Filter by status if provided
    if status and status != "All":
        query = query.filter(Customer.status == status)

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
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} not found."
        )
    return customer


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    customer_in: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check if email is already used by another customer
    existing = db.query(Customer).filter(Customer.email == customer_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A customer with this email address already exists."
        )

    new_customer = Customer(
        **customer_in.model_dump(),
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
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} not found."
        )

    update_data = customer_in.model_dump(exclude_unset=True)
    
    # Check email duplicate if email is being updated
    if "email" in update_data and update_data["email"] != customer.email:
        existing = db.query(Customer).filter(Customer.email == update_data["email"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A customer with this email address already exists."
            )

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
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID {customer_id} not found."
        )

    db.delete(customer)
    db.commit()
    return {"message": f"Customer with ID {customer_id} deleted successfully."}
