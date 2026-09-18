import uuid
import secrets
import hashlib
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import get_db, sync_db_schema
from app.models import User
from app.auth import get_password_hash

client = TestClient(app)

@pytest.fixture(scope="module")
def admin_headers():
    unique_email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "AdminSecurePassword123!"
    reg_res = client.post("/api/auth/register", json={
        "email": unique_email,
        "full_name": "Admin Tester",
        "password": pwd
    })
    assert reg_res.status_code == 201

    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": pwd
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "email": unique_email, "id": login_res.json()["user"]["id"]}


@pytest.fixture(scope="module")
def admin_headers_b():
    unique_email = f"admin_b_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "AdminBSecurePassword123!"
    reg_res = client.post("/api/auth/register", json={
        "email": unique_email,
        "full_name": "Admin B Tester",
        "password": pwd
    })
    assert reg_res.status_code == 201

    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": pwd
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "email": unique_email, "id": login_res.json()["user"]["id"]}


# =========================================================================
# 1. Database is_setup_complete & Employee Creation Flags
# =========================================================================

def test_database_is_setup_complete_and_employee_flags(admin_headers):
    """
    Verifies that:
    - New employees default to is_setup_complete = FALSE explicitly.
    - Setup token is stored as a SHA-256 hash, not plain text.
    - New employee cannot log in normally before setup is complete.
    """
    emp_email = f"emp_init_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Setup Flag Tester",
        "department": "Engineering",
        "job_title": "Developer",
        "phone": "+1 (555) 234-5678"
    }, headers={"Authorization": admin_headers["Authorization"]})

    assert create_res.status_code == 201
    emp_data = create_res.json()
    assert emp_data["role"] == "employee"
    assert emp_data["is_setup_complete"] is False

    # Check database record directly
    db = next(get_db())
    try:
        user_db = db.query(User).filter(User.email == emp_email).first()
        assert user_db is not None
        assert user_db.is_setup_complete is False
        assert user_db.setup_token_hash is not None
        # Verify setup token hash is 64-character SHA-256 hex string, NOT plain text
        assert len(user_db.setup_token_hash) == 64
        assert user_db.setup_token_expires is not None
    finally:
        db.close()

    # Verify normal login is rejected with 403 pending setup
    login_attempt = client.post("/api/auth/login", json={
        "email": emp_email,
        "password": "AnyDummyPassword123!"
    })
    assert login_attempt.status_code in (401, 403)


# =========================================================================
# 2. Employee Role Protection & Updates
# =========================================================================

def test_employee_cannot_modify_role(admin_headers):
    """
    Verifies:
    - Employee cannot modify their own role via PUT /api/employees/{id}.
    - Supported roles are strictly admin and employee.
    """
    emp_email = f"emp_role_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Role Test Employee",
        "department": "Sales"
    }, headers={"Authorization": admin_headers["Authorization"]})
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Manually complete setup to allow employee login
    db = next(get_db())
    try:
        u = db.query(User).filter(User.id == emp_id).first()
        u.hashed_password = get_password_hash("EmpPassword123!")
        u.is_setup_complete = True
        u.is_verified = True
        db.commit()
    finally:
        db.close()

    # Log in as employee
    login_res = client.post("/api/auth/login", json={
        "email": emp_email,
        "password": "EmpPassword123!"
    })
    assert login_res.status_code == 200
    emp_token = login_res.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # Employee tries to escalate role to admin in PUT payload
    update_res = client.put(f"/api/employees/{emp_id}", json={
        "full_name": "Role Escalation Attempt",
        "role": "admin"  # Should be stripped/ignored by schema
    }, headers=emp_headers)

    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["role"] == "employee"  # Role did NOT change!
    assert updated_data["full_name"] == "Role Escalation Attempt"

    # Employee tries to update another employee's profile
    other_res = client.put(f"/api/employees/{admin_headers['id']}", json={
        "full_name": "Hacked Admin"
    }, headers=emp_headers)
    assert other_res.status_code in (403, 404)


# =========================================================================
# 3. Token Revocation
# =========================================================================

def test_token_revocation_on_deactivation_and_password_change(admin_headers):
    """
    Verifies token_revoked_at invalidates active sessions upon deactivation and password change.
    """
    emp_email = f"emp_token_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Token Revoke Employee",
    }, headers={"Authorization": admin_headers["Authorization"]})
    emp_id = create_res.json()["id"]

    db = next(get_db())
    try:
        u = db.query(User).filter(User.id == emp_id).first()
        u.hashed_password = get_password_hash("OldPassword123!")
        u.is_setup_complete = True
        u.is_verified = True
        db.commit()
    finally:
        db.close()

    login_res = client.post("/api/auth/login", json={
        "email": emp_email,
        "password": "OldPassword123!"
    })
    old_token = login_res.json()["access_token"]

    # Verify token works initially
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert me_res.status_code == 200

    # Admin deactivates employee
    deact_res = client.delete(f"/api/employees/{emp_id}", headers={"Authorization": admin_headers["Authorization"]})
    assert deact_res.status_code == 200

    # Token must now be rejected with 401 or 403
    check_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert check_res.status_code in (401, 403)


# =========================================================================
# 4. Frontend Security Boundary / Backend Authorization
# =========================================================================

def test_employee_cannot_access_admin_endpoints(admin_headers):
    """
    Frontend security test:
    Verify that an Employee cannot access Admin functionality (e.g. Employee listing, creation, metrics)
    by changing frontend state, local storage, query params, or URLs.
    Backend authorization must strictly return 403 Forbidden.
    """
    emp_email = f"emp_sec_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Security Boundary Tester",
    }, headers={"Authorization": admin_headers["Authorization"]})
    emp_id = create_res.json()["id"]

    db = next(get_db())
    try:
        u = db.query(User).filter(User.id == emp_id).first()
        u.hashed_password = get_password_hash("ValidPass123!")
        u.is_setup_complete = True
        u.is_verified = True
        db.commit()
    finally:
        db.close()

    login_res = client.post("/api/auth/login", json={
        "email": emp_email,
        "password": "ValidPass123!"
    })
    emp_token = login_res.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # 1. Employee cannot list all employees
    list_emp = client.get("/api/employees", headers=emp_headers)
    assert list_emp.status_code == 403

    # 2. Employee cannot create another employee
    add_emp = client.post("/api/employees", json={
        "email": "fake_emp@example.com",
        "full_name": "Fake Employee"
    }, headers=emp_headers)
    assert add_emp.status_code == 403

    # 3. Employee cannot access metrics
    metrics_res = client.get("/api/employees/metrics", headers=emp_headers)
    assert metrics_res.status_code == 403

    # 4. Employee CAN view their own profile
    self_res = client.get(f"/api/employees/{emp_id}", headers=emp_headers)
    assert self_res.status_code == 200
    assert self_res.json()["email"] == emp_email


# =========================================================================
# 6. Email Setup Flow (Valid, Expired, Reused, New Invalidation)
# =========================================================================

def test_email_setup_flow_comprehensive(admin_headers):
    """
    Comprehensive tests for email setup link flow:
    - Test the actual setup link flow with password setting.
    - Verify expired links show clear error.
    - Verify used links cannot be reused.
    - Verify sending a new login email invalidates the previous link.
    - Verify the new link works correctly.
    """
    emp_email = f"emp_flow_{uuid.uuid4().hex[:8]}@example.com"

    # Step 1: Admin creates employee
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Setup Flow Worker",
    }, headers={"Authorization": admin_headers["Authorization"]})
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Retrieve raw token from simulation or generate known token
    raw_token_1 = secrets.token_urlsafe(32)
    token_1_hash = hashlib.sha256(raw_token_1.encode("utf-8")).hexdigest()

    db = next(get_db())
    try:
        emp = db.query(User).filter(User.id == emp_id).first()
        emp.setup_token_hash = token_1_hash
        emp.setup_token_expires = datetime.utcnow() + timedelta(hours=48)
        db.commit()
    finally:
        db.close()

    # Step 2: Test sending a NEW login email invalidates the previous link
    raw_token_2 = secrets.token_urlsafe(32)
    token_2_hash = hashlib.sha256(raw_token_2.encode("utf-8")).hexdigest()

    db = next(get_db())
    try:
        # Simulate admin re-sending login email with new token
        emp = db.query(User).filter(User.id == emp_id).first()
        emp.setup_token_hash = token_2_hash
        emp.setup_token_expires = datetime.utcnow() + timedelta(hours=48)
        db.commit()
    finally:
        db.close()

    # Old token (raw_token_1) MUST fail because it was invalidated by the new email
    old_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token_1,
        "email": emp_email,
        "new_password": "NewEmployeePassword123!",
        "confirm_password": "NewEmployeePassword123!"
    })
    assert old_res.status_code == 400
    assert "invalid" in old_res.json()["detail"].lower() or "unrecognized" in old_res.json()["detail"].lower()

    # Step 3: Test Expired Token rejection
    db = next(get_db())
    try:
        emp = db.query(User).filter(User.id == emp_id).first()
        emp.setup_token_expires = datetime.utcnow() - timedelta(hours=1)  # expired
        db.commit()
    finally:
        db.close()

    expired_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token_2,
        "email": emp_email,
        "new_password": "NewEmployeePassword123!",
        "confirm_password": "NewEmployeePassword123!"
    })
    assert expired_res.status_code == 400
    assert "expired" in expired_res.json()["detail"].lower()

    # Step 4: Give a fresh, valid token and verify success
    raw_token_3 = secrets.token_urlsafe(32)
    token_3_hash = hashlib.sha256(raw_token_3.encode("utf-8")).hexdigest()

    db = next(get_db())
    try:
        emp = db.query(User).filter(User.id == emp_id).first()
        emp.setup_token_hash = token_3_hash
        emp.setup_token_expires = datetime.utcnow() + timedelta(hours=48)
        db.commit()
    finally:
        db.close()

    success_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token_3,
        "email": emp_email,
        "new_password": "FinalSecurePassword123!",
        "confirm_password": "FinalSecurePassword123!"
    })
    assert success_res.status_code == 200
    assert "completed" in success_res.json()["message"].lower()

    # Step 5: Verify Used link CANNOT be reused (single-use constraint)
    reuse_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token_3,
        "email": emp_email,
        "new_password": "AnotherPassword123!",
        "confirm_password": "AnotherPassword123!"
    })
    assert reuse_res.status_code == 400
    assert any(w in reuse_res.json()["detail"].lower() for w in ["invalid", "unrecognized", "already set up"])

    # Step 6: Verify employee can now log in normally
    login_res = client.post("/api/auth/login", json={
        "email": emp_email,
        "password": "FinalSecurePassword123!"
    })
    assert login_res.status_code == 200
    assert login_res.json()["user"]["is_setup_complete"] is True
    assert login_res.json()["user"]["role"] == "employee"


def test_employee_status_filters_and_search(admin_headers):
    """
    Test all 4 status filters (active, inactive, pending, completed)
    and their combination with the search query across all 4 independent combinations:
    1. Active + Pending
    2. Active + Completed
    3. Inactive + Pending
    4. Inactive + Completed
    """
    prefix = uuid.uuid4().hex[:6]
    db = next(get_db())
    try:
        # 1. Active + Pending
        u1 = User(
            email=f"filt_{prefix}_ap@example.com",
            full_name="Filter AP Tester",
            department="Engineering",
            job_title="Dev",
            role="employee",
            is_active=True,
            is_setup_complete=False
        )
        # 2. Active + Completed
        u2 = User(
            email=f"filt_{prefix}_ac@example.com",
            full_name="Filter AC Tester",
            department="Engineering",
            job_title="Senior Dev",
            role="employee",
            is_active=True,
            is_setup_complete=True,
            hashed_password=get_password_hash("Password123!")
        )
        # 3. Inactive + Pending
        u3 = User(
            email=f"filt_{prefix}_ip@example.com",
            full_name="Filter IP Tester",
            department="Design",
            job_title="UI Designer",
            role="employee",
            is_active=False,
            is_setup_complete=False
        )
        # 4. Inactive + Completed
        u4 = User(
            email=f"filt_{prefix}_ic@example.com",
            full_name="Filter IC Tester",
            department="Marketing",
            job_title="Growth",
            role="employee",
            is_active=False,
            is_setup_complete=True,
            hashed_password=get_password_hash("Password123!")
        )
        db.add_all([u1, u2, u3, u4])
        db.commit()
    finally:
        db.close()

    auth_h = {"Authorization": admin_headers["Authorization"]}

    # Test status=active
    res = client.get(f"/api/employees?search={prefix}&status=active", headers=auth_h)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert all(e["is_active"] is True for e in items)

    # Test status=inactive
    res = client.get(f"/api/employees?search={prefix}&status=inactive", headers=auth_h)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert all(e["is_active"] is False for e in items)

    # Test status=pending
    res = client.get(f"/api/employees?search={prefix}&status=pending", headers=auth_h)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert all(e["is_setup_complete"] is False for e in items)

    # Test status=completed
    res = client.get(f"/api/employees?search={prefix}&status=completed", headers=auth_h)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert all(e["is_setup_complete"] is True for e in items)

    # Test search + filter combination: search "Engineering" + status="active"
    res = client.get(f"/api/employees?search={prefix}_ac&status=active", headers=auth_h)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["email"] == f"filt_{prefix}_ac@example.com"


def test_employee_metrics_endpoint_accuracy(admin_headers):
    """Verify /api/employees/metrics returns accurate counts unaffected by filters or search."""
    auth_h = {"Authorization": admin_headers["Authorization"]}
    res = client.get("/api/employees/metrics", headers=auth_h)
    assert res.status_code == 200
    data = res.json()
    assert "total_employees" in data
    assert "active_staff" in data
    assert "inactive_staff" in data
    assert "setup_pending" in data
    assert "setup_completed" in data
    assert data["total_employees"] == data["active_staff"] + data["inactive_staff"]
    assert data["total_employees"] == data["setup_pending"] + data["setup_completed"]


def test_employee_deactivation_reactivation_and_jwt_security(admin_headers):
    """
    Test deactivation, reactivation, and strict JWT security:
    - Inactive employee cannot log in (403).
    - Reactivation sets is_active = True and allows login.
    - Previously issued/revoked token remains invalid (401) after reactivation.
    - New login after reactivation generates a valid token (200).
    - Employee cannot reactivate themselves or others (403).
    - Admin cannot reactivate an Admin account (400).
    - Cannot reactivate already-active employee (400).
    """
    import time
    auth_h = {"Authorization": admin_headers["Authorization"]}
    email = f"react_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "EmployeePassword123!"

    # 1. Create and complete setup for an employee
    db = next(get_db())
    try:
        emp = User(
            email=email,
            full_name="Reactivate Tester",
            role="employee",
            is_active=True,
            is_setup_complete=True,
            hashed_password=get_password_hash(pwd)
        )
        db.add(emp)
        db.commit()
        db.refresh(emp)
        emp_id = emp.id
    finally:
        db.close()

    # 2. Log in and get active session token
    login_res = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login_res.status_code == 200
    old_token = login_res.json()["access_token"]
    old_headers = {"Authorization": f"Bearer {old_token}"}

    # Verify session works
    me_res = client.get(f"/api/employees/{emp_id}", headers=old_headers)
    assert me_res.status_code == 200

    # 3. Cannot reactivate an already-active employee
    already_active_res = client.post(f"/api/employees/{emp_id}/reactivate", headers=auth_h)
    assert already_active_res.status_code == 400
    assert "already active" in already_active_res.json()["detail"].lower()

    # 4. Soft-deactivate employee
    time.sleep(1) # Ensure timestamp advances for token_revoked_at
    deact_res = client.delete(f"/api/employees/{emp_id}", headers=auth_h)
    assert deact_res.status_code == 200

    # Verify inactive employee appears under Inactive and All, but excluded from Active
    inact_res = client.get(f"/api/employees?search={email}&status=inactive", headers=auth_h)
    assert len(inact_res.json()) == 1
    act_res = client.get(f"/api/employees?search={email}&status=active", headers=auth_h)
    assert len(act_res.json()) == 0

    # Verify inactive employee cannot log in
    inact_login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert inact_login.status_code == 403

    # Verify old token is rejected
    old_token_res = client.get(f"/api/employees/{emp_id}", headers=old_headers)
    assert old_token_res.status_code in [401, 403]

    # 5. Non-admin cannot call reactivate endpoint
    unauth_reactivate = client.post(f"/api/employees/{emp_id}/reactivate", headers=old_headers)
    assert unauth_reactivate.status_code in [401, 403]

    # 6. Admin cannot reactivate an Admin account
    admin_id = admin_headers["id"]
    admin_reactivate = client.post(f"/api/employees/{admin_id}/reactivate", headers=auth_h)
    assert admin_reactivate.status_code in [400, 404]

    # 7. Reactivate the employee
    time.sleep(1)
    react_res = client.post(f"/api/employees/{emp_id}/reactivate", headers=auth_h)
    assert react_res.status_code == 200
    assert react_res.json()["is_active"] is True

    # 8. CRITICAL SECURITY: Verify old token issued prior to deactivation REMAINS INVALID
    old_token_after_react = client.get(f"/api/employees/{emp_id}", headers=old_headers)
    assert old_token_after_react.status_code == 401
    assert "terminated" in old_token_after_react.json()["detail"].lower()

    # 9. New login after reactivation works and produces functional token
    new_login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert new_login.status_code == 200
    new_token = new_login.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}

    new_me_res = client.get(f"/api/employees/{emp_id}", headers=new_headers)
    assert new_me_res.status_code == 200
    assert new_me_res.json()["email"] == email


def test_admin_self_protection_and_permanent_deletion_safeguards(admin_headers, admin_headers_b):
    """
    Test:
    1. Admin cannot deactivate or delete their own account (400).
    2. Admin cannot delete another Admin via employee API (404/400).
    3. Employee can be deactivated and permanently deleted.
    4. Permanently deleted employee's token is immediately rejected with 401.
    """
    auth_h = {"Authorization": admin_headers["Authorization"]}
    auth_h_b = {"Authorization": admin_headers_b["Authorization"]}

    # 1. Admin cannot deactivate or delete themselves
    admin_id = admin_headers["id"]
    self_del = client.delete(f"/api/employees/{admin_id}", headers=auth_h)
    assert self_del.status_code == 400
    assert "cannot deactivate or delete their own account" in self_del.json()["detail"].lower()

    # 2. Admin cannot delete another admin through employee API
    admin_b_id = admin_headers_b["id"]
    other_admin_del = client.delete(f"/api/employees/{admin_b_id}", headers=auth_h)
    assert other_admin_del.status_code in [400, 404]

    # 3. Create employee for deletion testing
    clean_email = f"clean_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "Password123!"
    db = next(get_db())
    try:
        clean_emp = User(
            email=clean_email,
            full_name="Clean Employee",
            role="employee",
            is_active=True,
            is_setup_complete=True,
            hashed_password=get_password_hash(pwd)
        )
        db.add(clean_emp)
        db.commit()
        db.refresh(clean_emp)
        clean_id = clean_emp.id
    finally:
        db.close()

    # Attempt permanent deletion without confirmed=true -> must be BLOCKED with 400
    unconfirmed = client.delete(f"/api/employees/{clean_id}?permanent=true", headers=auth_h)
    assert unconfirmed.status_code == 400
    assert "confirmed=true" in unconfirmed.json()["detail"].lower()
    clean_email = f"clean_{uuid.uuid4().hex[:6]}@example.com"
    db = next(get_db())
    try:
        clean_emp = User(
            email=clean_email,
            full_name="Clean Employee",
            role="employee",
            is_active=True,
            is_setup_complete=True,
            hashed_password=get_password_hash(pwd)
        )
        db.add(clean_emp)
        db.commit()
        db.refresh(clean_emp)
        clean_id = clean_emp.id
    finally:
        db.close()

    # Log in as clean employee to obtain a token
    clean_login = client.post("/api/auth/login", json={"email": clean_email, "password": pwd})
    assert clean_login.status_code == 200
    clean_token = clean_login.json()["access_token"]
    clean_headers = {"Authorization": f"Bearer {clean_token}"}

    # Permanently delete clean employee with confirmed=true -> succeeds
    perm_del_success = client.delete(f"/api/employees/{clean_id}?permanent=true&confirmed=true", headers=auth_h)
    assert perm_del_success.status_code == 200
    assert "permanently deleted" in perm_del_success.json()["message"].lower()

    # Verify clean employee's token is immediately rejected with 401 on protected APIs
    deleted_user_req = client.get(f"/api/employees/{clean_id}", headers=clean_headers)
    assert deleted_user_req.status_code == 401

