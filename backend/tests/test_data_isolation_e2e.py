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


@pytest.fixture(scope="module")
def admin_user():
    email = f"admin_iso_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "AdminSecurePassword123!"
    reg = client.post("/api/auth/register", json={"email": email, "full_name": "Admin Isolation", "password": pwd})
    assert reg.status_code == 201

    login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"email": email, "headers": {"Authorization": f"Bearer {token}"}, "id": login.json()["user"]["id"]}


@pytest.fixture(scope="module")
def employee_a(admin_user):
    email = f"emp_a_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": email,
        "full_name": "Employee Alpha",
        "department": "Engineering",
        "job_title": "Backend Engineer",
        "company": "Acme Corp"
    }, headers=admin_user["headers"])
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

    pwd = "EmpAPassword123!"
    setup_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token,
        "email": email,
        "new_password": pwd,
        "confirm_password": pwd
    })
    assert setup_res.status_code == 200

    login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"id": emp_id, "email": email, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def employee_b(admin_user):
    email = f"emp_b_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": email,
        "full_name": "Employee Beta",
        "department": "Design",
        "job_title": "UI Designer",
        "company": "Acme Corp"
    }, headers=admin_user["headers"])
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

    pwd = "EmpBPassword123!"
    setup_res = client.post("/api/auth/setup-employee", json={
        "token": raw_token,
        "email": email,
        "new_password": pwd,
        "confirm_password": pwd
    })
    assert setup_res.status_code == 200

    login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"id": emp_id, "email": email, "headers": {"Authorization": f"Bearer {token}"}}


def test_employee_a_self_service(employee_a):
    """Employee A can view and update their own profile via /me"""
    me_res = client.get("/api/employees/me", headers=employee_a["headers"])
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["email"] == employee_a["email"]
    assert data["role"] == "employee"

    update_res = client.put("/api/employees/me", json={
        "full_name": "Employee Alpha Updated",
        "department": "Platform Engineering",
        "phone": "+1 (555) 999-0001",
        "address": "789 Tech Park Road"
    }, headers=employee_a["headers"])
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["full_name"] == "Employee Alpha Updated"
    assert updated_data["department"] == "Platform Engineering"
    assert updated_data["phone"] == "+1 (555) 999-0001"
    assert updated_data["address"] == "789 Tech Park Road"


def test_employee_a_cannot_access_admin_endpoints(employee_a):
    """Employee A is blocked from listing, metrics, and creating employees"""
    list_res = client.get("/api/employees", headers=employee_a["headers"])
    assert list_res.status_code == 403

    metrics_res = client.get("/api/employees/metrics", headers=employee_a["headers"])
    assert metrics_res.status_code == 403

    create_res = client.post("/api/employees", json={
        "email": "hacker@example.com",
        "full_name": "Hacker Employee"
    }, headers=employee_a["headers"])
    assert create_res.status_code == 403


def test_employee_b_cannot_view_or_modify_employee_a(employee_a, employee_b):
    """Employee B cannot view or modify Employee A's profile via direct endpoints"""
    view_res = client.get(f"/api/employees/{employee_a['id']}", headers=employee_b["headers"])
    assert view_res.status_code == 403

    update_res = client.put(f"/api/employees/{employee_a['id']}", json={
        "full_name": "Hijacked by B"
    }, headers=employee_b["headers"])
    assert update_res.status_code == 403

    delete_res = client.delete(f"/api/employees/{employee_a['id']}", headers=employee_b["headers"])
    assert delete_res.status_code == 403


def test_admin_full_visibility_and_control(admin_user, employee_a, employee_b):
    """HR/Admin can view, list, and modify both Employee A and Employee B"""
    list_res = client.get("/api/employees?limit=200", headers=admin_user["headers"])
    assert list_res.status_code == 200
    emp_ids = [e["id"] for e in list_res.json()]
    assert employee_a["id"] in emp_ids
    assert employee_b["id"] in emp_ids

    view_a = client.get(f"/api/employees/{employee_a['id']}", headers=admin_user["headers"])
    assert view_a.status_code == 200
    assert view_a.json()["email"] == employee_a["email"]

    view_b = client.get(f"/api/employees/{employee_b['id']}", headers=admin_user["headers"])
    assert view_b.status_code == 200
    assert view_b.json()["email"] == employee_b["email"]

    metrics_res = client.get("/api/employees/metrics", headers=admin_user["headers"])
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert "total_employees" in metrics
    assert "active_staff" in metrics
