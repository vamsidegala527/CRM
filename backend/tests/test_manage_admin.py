"""
Unit Tests for Developer Admin Account Management Utility (manage_admin.py)
"""

import uuid
import pytest
from app.database import SessionLocal
from app.models import User
from app.auth import verify_password
from manage_admin import create_admin, update_admin, delete_admin


def test_manage_admin_crud_lifecycle():
    unique_id = uuid.uuid4().hex[:8]
    test_email = f"test_cli_admin_{unique_id}@testcorp.com"
    test_name = "CLI Test Admin"
    test_pass = "InitialPass123!"
    updated_pass = "UpdatedPass456!"
    updated_name = "CLI Test Admin Updated"

    # 1. Create Admin
    created = create_admin(
        email=test_email,
        full_name=test_name,
        password=test_pass
    )
    assert created is True

    # Verify user in database
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == test_email).first()
        assert user is not None
        assert user.role == "admin"
        assert user.full_name == test_name
        assert user.is_active is True
        assert user.is_setup_complete is True
        assert verify_password(test_pass, user.hashed_password) is True

        # 2. Update Admin (Name & Password)
        updated = update_admin(
            email=test_email,
            password=updated_pass,
            full_name=updated_name
        )
        assert updated is True

        db.refresh(user)
        assert user.full_name == updated_name
        assert verify_password(updated_pass, user.hashed_password) is True

        # 3. Delete Admin
        deleted = delete_admin(email=test_email, force=True)
        assert deleted is True

        deleted_user = db.query(User).filter(User.email == test_email).first()
        assert deleted_user is None
    finally:
        db.close()
