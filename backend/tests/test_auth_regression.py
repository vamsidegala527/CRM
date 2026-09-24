import uuid
import secrets
import hashlib
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import get_db
from app.models import User

client = TestClient(app)


def test_01_registration_success():
    unique_email = f"authreg_{uuid.uuid4().hex[:8]}@testcorp.com"
    payload = {
        "email": unique_email,
        "full_name": "Auth Reg Tester",
        "password": "SecurePassword123!"
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == unique_email.lower()
    assert data["full_name"] == "Auth Reg Tester"
    assert "id" in data


def test_02_registration_duplicate_email_409():
    email = f"dup_{uuid.uuid4().hex[:8]}@testcorp.com"
    payload = {
        "email": email,
        "full_name": "Initial User",
        "password": "Password123!"
    }
    first_res = client.post("/api/auth/register", json=payload)
    assert first_res.status_code == 201

    dup_res = client.post("/api/auth/register", json={
        "email": email.upper(),
        "full_name": "Duplicate User",
        "password": "Password123!"
    })
    assert dup_res.status_code == 409
    assert "already exists" in dup_res.json()["detail"].lower()


def test_03_login_valid_credentials():
    email = f"validlogin_{uuid.uuid4().hex[:8]}@testcorp.com"
    pwd = "ValidPassword123!"
    reg_res = client.post("/api/auth/register", json={
        "email": email,
        "full_name": "Valid User",
        "password": pwd
    })
    assert reg_res.status_code == 201

    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": pwd
    })
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == email


def test_04_login_invalid_password_401():
    email = f"badlogin_{uuid.uuid4().hex[:8]}@testcorp.com"
    reg_res = client.post("/api/auth/register", json={
        "email": email,
        "full_name": "Bad Pwd User",
        "password": "CorrectPassword123!"
    })
    assert reg_res.status_code == 201

    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": "WrongPassword456!"
    })
    assert login_res.status_code == 401
    detail = login_res.json()["detail"].lower()
    assert "incorrect" in detail or "invalid" in detail or "password" in detail


def test_05_inactive_employee_login_rejection():
    admin_email = f"admin_inact_{uuid.uuid4().hex[:8]}@testcorp.com"
    admin_pwd = "AdminPassword123!"
    client.post("/api/auth/register", json={"email": admin_email, "full_name": "Admin", "password": admin_pwd})
    admin_login = client.post("/api/auth/login", json={"email": admin_email, "password": admin_pwd})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    emp_email = f"emp_deact_{uuid.uuid4().hex[:8]}@testcorp.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Deact Employee",
        "department": "Support"
    }, headers=admin_headers)
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Setup token in DB
    raw_token = secrets.token_urlsafe(32)
    db: Session = next(get_db())
    try:
        user = db.query(User).filter(User.id == emp_id).first()
        user.setup_token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        user.setup_token_expires = datetime.utcnow() + timedelta(hours=24)
        db.commit()
    finally:
        db.close()

    # Complete setup via /api/auth/setup-employee
    emp_pwd = "EmpPassword123!"
    setup_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token,
        "email": emp_email,
        "new_password": emp_pwd,
        "confirm_password": emp_pwd
    })
    assert setup_res.status_code == 200

    # Soft deactivate employee
    deact_res = client.delete(f"/api/employees/{emp_id}?permanent=false", headers=admin_headers)
    assert deact_res.status_code == 200

    # Attempt login while inactive -> 403 Forbidden
    login_res = client.post("/api/auth/login", json={
        "email": emp_email,
        "password": emp_pwd
    })
    assert login_res.status_code == 403
    detail = login_res.json()["detail"].lower()
    assert "inactive" in detail or "deactivated" in detail


def test_06_password_reset_flow():
    email = f"reset_{uuid.uuid4().hex[:8]}@testcorp.com"
    pwd = "InitialPassword123!"
    client.post("/api/auth/register", json={"email": email, "full_name": "Reset User", "password": pwd})

    # Trigger forgot-password
    forgot_res = client.post("/api/auth/forgot-password", json={"email": email})
    assert forgot_res.status_code == 200

    # Directly set a known reset token in DB
    raw_token = secrets.token_urlsafe(24)
    db: Session = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        user.reset_password_token = raw_token
        user.reset_password_expires = datetime.utcnow() + timedelta(minutes=15)
        db.commit()
    finally:
        db.close()

    # Reset password
    new_pwd = "NewSecurePassword123!"
    reset_res = client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": new_pwd,
        "confirm_password": new_pwd
    })
    assert reset_res.status_code == 200

    # Old password fails
    old_login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert old_login.status_code == 401

    # New password succeeds
    new_login = client.post("/api/auth/login", json={"email": email, "password": new_pwd})
    assert new_login.status_code == 200


def test_07_email_verification_flow():
    email = f"verify_{uuid.uuid4().hex[:8]}@testcorp.com"
    pwd = "VerifyPassword123!"
    client.post("/api/auth/register", json={"email": email, "full_name": "Verify User", "password": pwd})

    # Resend verification
    resend_res = client.post("/api/auth/resend-verification", json={"email": email})
    assert resend_res.status_code == 200

    # Directly set a known 6-digit code in DB
    raw_code = "654321"
    db: Session = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user.is_verified is False
        user.verification_token = raw_code
        user.verification_token_expires = datetime.utcnow() + timedelta(minutes=30)
        db.commit()
    finally:
        db.close()

    # Verify email
    verify_res = client.post("/api/auth/verify-email", json={"token": raw_code})
    assert verify_res.status_code == 200

    # Confirm user is now verified
    db = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user.is_verified is True
    finally:
        db.close()


def test_08_token_revocation_on_logout():
    email = f"logout_{uuid.uuid4().hex[:8]}@testcorp.com"
    pwd = "LogoutPassword123!"
    client.post("/api/auth/register", json={"email": email, "full_name": "Logout User", "password": pwd})

    login_res = client.post("/api/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Protected endpoint works
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Protected endpoint now rejected (401)
    me_after = client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 401


def test_09_token_revocation_on_password_change():
    email = f"pwdchange_{uuid.uuid4().hex[:8]}@testcorp.com"
    pwd = "OldPassword123!"
    client.post("/api/auth/register", json={"email": email, "full_name": "Pwd Change User", "password": pwd})

    login_res = client.post("/api/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    new_pwd = "NewPassword123!"
    change_res = client.post("/api/auth/change-password", json={
        "current_password": pwd,
        "new_password": new_pwd,
        "confirm_password": new_pwd
    }, headers=headers)
    assert change_res.status_code == 200

    # Old token must now be revoked
    me_after = client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 401

    # Login with new password succeeds
    login_new = client.post("/api/auth/login", json={"email": email, "password": new_pwd})
    assert login_new.status_code == 200


def test_10_expired_or_invalid_jwt_rejection():
    bad_headers = {"Authorization": "Bearer not.a.valid.jwt.token"}
    res = client.get("/api/auth/me", headers=bad_headers)
    assert res.status_code == 401


def test_11_reactivation_jwt_security():
    admin_email = f"admin_react_{uuid.uuid4().hex[:8]}@testcorp.com"
    admin_pwd = "AdminPassword123!"
    client.post("/api/auth/register", json={"email": admin_email, "full_name": "Admin", "password": admin_pwd})
    admin_login = client.post("/api/auth/login", json={"email": admin_email, "password": admin_pwd})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    emp_email = f"emp_react_{uuid.uuid4().hex[:8]}@testcorp.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Reactivate Target",
        "department": "Security"
    }, headers=admin_headers)
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Setup employee
    raw_token = secrets.token_urlsafe(32)
    db: Session = next(get_db())
    try:
        user = db.query(User).filter(User.id == emp_id).first()
        user.setup_token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        user.setup_token_expires = datetime.utcnow() + timedelta(hours=24)
        db.commit()
    finally:
        db.close()

    emp_pwd = "TargetPassword123!"
    setup_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token,
        "email": emp_email,
        "new_password": emp_pwd,
        "confirm_password": emp_pwd
    })
    assert setup_res.status_code == 200

    # Step 1: Login and get Token 1
    login1_res = client.post("/api/auth/login", json={"email": emp_email, "password": emp_pwd})
    assert login1_res.status_code == 200
    token_1 = login1_res.json()["access_token"]
    headers_1 = {"Authorization": f"Bearer {token_1}"}

    # Verify Token 1 works
    me1 = client.get("/api/employees/me", headers=headers_1)
    assert me1.status_code == 200

    # Step 2: Soft-deactivate employee
    deact_res = client.delete(f"/api/employees/{emp_id}?permanent=false", headers=admin_headers)
    assert deact_res.status_code == 200

    # Step 3: Token 1 is now rejected (403 for inactive account, or 401 for revoked session)
    me_deact = client.get("/api/employees/me", headers=headers_1)
    assert me_deact.status_code in (401, 403)

    # Step 4: Reactivate employee
    react_res = client.post(f"/api/employees/{emp_id}/reactivate", headers=admin_headers)
    assert react_res.status_code == 200
    assert react_res.json()["is_active"] is True

    # Step 5: Token 1 MUST STILL BE REJECTED WITH 401 even though user is active again!
    me_after_react = client.get("/api/employees/me", headers=headers_1)
    assert me_after_react.status_code == 401

    # Step 6: Fresh login produces Token 2
    login2_res = client.post("/api/auth/login", json={"email": emp_email, "password": emp_pwd})
    assert login2_res.status_code == 200
    token_2 = login2_res.json()["access_token"]
    headers_2 = {"Authorization": f"Bearer {token_2}"}

    # Step 7: Token 2 works properly!
    me2 = client.get("/api/employees/me", headers=headers_2)
    assert me2.status_code == 200
    assert me2.json()["email"] == emp_email


def test_12_google_oauth_mock():
    res = client.post("/api/auth/google", json={"id_token": "invalid_fake_token"})
    assert res.status_code in [400, 401, 500]
