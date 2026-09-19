import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.models import User
from app.auth import get_password_hash

client = TestClient(app)


@pytest.fixture(scope="module")
def admin_headers():
    unique_email = f"admin_cb_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": unique_email,
        "full_name": "Admin CB",
        "password": "AdminPassword123!"
    })
    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": "AdminPassword123!"
    })
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def employee_headers(admin_headers):
    unique_email = f"emp_cb_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "EmpSecurePassword123!"
    res = client.post("/api/employees", headers=admin_headers, json={
        "email": unique_email,
        "full_name": "Employee CB",
        "role": "employee",
        "department": "Support"
    })
    assert res.status_code == 201
    emp_id = res.json()["id"]

    db = next(get_db())
    try:
        u = db.query(User).filter(User.id == emp_id).first()
        u.hashed_password = get_password_hash(pwd)
        u.is_setup_complete = True
        u.is_verified = True
        db.commit()
    finally:
        db.close()

    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": pwd
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "email": unique_email, "id": emp_id}


def test_chatbot_unauthenticated_request_rejected():
    res = client.get("/api/employees")
    assert res.status_code == 401
    assert "detail" in res.json()


def test_chatbot_invalid_token_rejected():
    res = client.get("/api/employees", headers={"Authorization": "Bearer invalid_jwt_token_12345"})
    assert res.status_code == 401


def test_chatbot_admin_creates_employee(admin_headers):
    unique_email = f"emp_a_{uuid.uuid4().hex[:8]}@acme.com"
    res = client.post("/api/employees", headers=admin_headers, json={
        "full_name": "Employee A",
        "email": unique_email,
        "phone": "9876543210",
        "department": "Engineering",
        "job_title": "Backend Dev"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["full_name"] == "Employee A"
    assert data["email"] == unique_email


def test_chatbot_search_employees_filter(admin_headers):
    unique_dept = f"Dept{uuid.uuid4().hex[:6]}"
    res = client.post("/api/employees", headers=admin_headers, json={
        "full_name": "Searchable Employee",
        "email": f"{unique_dept.lower()}@search.com",
        "phone": "9876543210",
        "department": unique_dept,
        "job_title": "Specialist"
    })
    assert res.status_code == 201

    # Search with department keyword
    search_res = client.get(f"/api/employees?search={unique_dept}", headers=admin_headers)
    assert search_res.status_code == 200
    items = search_res.json()
    assert any(c["department"] == unique_dept for c in items)


def test_chatbot_update_employee(admin_headers):
    # Create employee
    create_res = client.post("/api/employees", headers=admin_headers, json={
        "full_name": "Updatable Employee",
        "email": f"update_{uuid.uuid4().hex[:8]}@acme.com",
        "phone": "1234567890",
        "department": "Operations"
    })
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Update phone and department
    update_res = client.put(f"/api/employees/{emp_id}", headers=admin_headers, json={
        "phone": "9998887777",
        "department": "Finance"
    })
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["phone"] == "9998887777"
    assert data["department"] == "Finance"


def test_chatbot_metrics_endpoint(admin_headers):
    res = client.get("/api/employees/metrics", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_employees" in data
    assert "active_staff" in data
    assert "setup_pending" in data


def test_chatbot_validation_handling(admin_headers):
    # Invalid email format should be rejected with 422
    res = client.post("/api/employees", headers=admin_headers, json={
        "full_name": "Invalid Employee",
        "email": "not-an-email",
        "phone": "1234567890"
    })
    assert res.status_code == 422


def test_chatbot_employee_can_get_own_profile(employee_headers):
    res = client.get("/api/employees/me", headers={"Authorization": employee_headers["Authorization"]})
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == employee_headers["email"]
    assert data["role"] == "employee"


def test_chatbot_employee_can_update_own_profile(employee_headers):
    res = client.put("/api/employees/me", headers={"Authorization": employee_headers["Authorization"]}, json={
        "phone": "+1 (555) 777-8888",
        "department": "Support Team Alpha"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["phone"] == "+1 (555) 777-8888"
    assert data["department"] == "Support Team Alpha"


def test_chatbot_employee_strictly_forbidden_from_admin_directory(employee_headers):
    # 1. Directory listing is 403
    res_list = client.get("/api/employees", headers={"Authorization": employee_headers["Authorization"]})
    assert res_list.status_code == 403

    # 2. Directory metrics is 403
    res_metrics = client.get("/api/employees/metrics", headers={"Authorization": employee_headers["Authorization"]})
    assert res_metrics.status_code == 403

    # 3. Employee creation is 403
    res_create = client.post("/api/employees", headers={"Authorization": employee_headers["Authorization"]}, json={
        "email": "hacker@example.com",
        "full_name": "Hacker Impostor"
    })
    assert res_create.status_code == 403


def test_chatbot_auth_me_returns_isolated_role(admin_headers, employee_headers):
    admin_me = client.get("/api/auth/me", headers={"Authorization": admin_headers["Authorization"]})
    assert admin_me.status_code == 200
    assert admin_me.json()["role"] == "admin"

    emp_me = client.get("/api/auth/me", headers={"Authorization": employee_headers["Authorization"]})
    assert emp_me.status_code == 200
    assert emp_me.json()["role"] == "employee"

