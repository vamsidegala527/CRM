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
    """List all customers owned by the authenticated user with search, status filter, and pagination."""
    query = db.query(Customer).filter(Customer.owner_id == current_user.id)

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


def get_customer_or_404(db: Session, identifier: str, user_id: int) -> Customer:
    """Safely retrieves a customer owned by user_id by either numeric ID or UUID public_id."""
    clean_id = str(identifier).strip()
    if not clean_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer identifier cannot be empty."
        )

    if clean_id.isdigit():
        int_id = int(clean_id)
        if int_id <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid customer ID. Must be a positive integer or valid UUID."
            )
        customer = db.query(Customer).filter(
            Customer.id == int_id,
            Customer.owner_id == user_id
        ).first()
    else:
        customer = db.query(Customer).filter(
            Customer.public_id == clean_id,
            Customer.owner_id == user_id
        ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer '{identifier}' not found."
        )
    return customer


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer_by_id(
    customer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve detailed customer record by numeric ID or UUID owned by the authenticated user."""
    return get_customer_or_404(db, customer_id, current_user.id)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    customer_in: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new customer record tied to the authenticated user."""
    email_clean = customer_in.email.strip().lower()

    # Case-insensitive duplicate check for customer email under the authenticated user
    existing = db.query(Customer).filter(
        Customer.owner_id == current_user.id,
        func.lower(Customer.email) == email_clean
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A customer with the email address '{email_clean}' already exists in your account."
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
def replace_customer(
    customer_id: str,
    customer_in: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Full update / replacement of an existing customer record owned by the authenticated user."""
    customer = get_customer_or_404(db, customer_id, current_user.id)

    new_email = customer_in.email.strip().lower()
    if new_email != customer.email.lower():
        existing = db.query(Customer).filter(
            Customer.owner_id == current_user.id,
            func.lower(Customer.email) == new_email
        ).first()
        if existing and existing.id != customer.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A customer with the email address '{new_email}' already exists in your account."
            )

    customer.name = customer_in.name
    customer.email = new_email
    customer.phone = customer_in.phone
    customer.company = customer_in.company
    customer.address = customer_in.address
    customer.status = customer_in.status or "Active"
    customer.notes = customer_in.notes

    db.commit()
    db.refresh(customer)
    return customer


@router.patch("/{customer_id}", response_model=CustomerResponse)
def patch_customer(
    customer_id: str,
    customer_in: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Partial update of specific fields in an existing customer record owned by the authenticated user."""
    customer = get_customer_or_404(db, customer_id, current_user.id)

    update_data = customer_in.model_dump(exclude_unset=True)

    if "email" in update_data and update_data["email"]:
        new_email = update_data["email"].strip().lower()
        if new_email != customer.email.lower():
            existing = db.query(Customer).filter(
                Customer.owner_id == current_user.id,
                func.lower(Customer.email) == new_email
            ).first()
            if existing and existing.id != customer.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A customer with the email address '{new_email}' already exists in your account."
                )
        update_data["email"] = new_email

    for field, value in update_data.items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_200_OK)
def delete_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a customer record owned by the authenticated user."""
    customer = get_customer_or_404(db, customer_id, current_user.id)

    display_name = customer.name
    db.delete(customer)
    db.commit()
    return {"message": f"Customer '{display_name}' deleted successfully."}
