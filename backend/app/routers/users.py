from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserResponse, UserUpdateRole, UserUpdateStatus
from app.auth import require_admin

router = APIRouter(prefix="/api/users", tags=["User Management (Admin Only)"])

@router.get("", response_model=List[UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Retrieve list of all registered users (Admin Only)"""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.put("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    role_in: UserUpdateRole,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Update user role to admin or user (Admin Only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found."
        )
    
    # Prevent admin from demoting themselves to normal user if they are the only admin
    if user.id == admin_user.id and role_in.role != "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the only remaining administrator."
            )

    user.role = role_in.role
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    status_in: UserUpdateStatus,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Activate or deactivate a user account (Admin Only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found."
        )

    # Prevent admin from deactivating themselves
    if user.id == admin_user.id and not status_in.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own administrative account."
        )

    user.is_active = status_in.is_active
    db.commit()
    db.refresh(user)
    return user
