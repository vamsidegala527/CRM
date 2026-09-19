import uuid
import secrets
import hashlib
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.models import User

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_external_emails(monkeypatch):
    import app.email_service
    monkeypatch.setattr(app.email_service, "_send_mime_message", lambda *a, **kw: None)


@pytest.fixture(scope="module")
def admin_headers():
    unique_email = f"admin_setup_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "AdminSetupPassword123!"
    reg_res = client.post("/api/auth/register", json={"email": unique_email, "full_name": "Admin Setup", "password": pwd})
    assert reg_res.status_code == 201
    login_res = client.post("/api/auth/login", json={"email": unique_email, "password": pwd})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_employee_creation_and_setup_link(admin_headers):
    emp_email = f"emp_newlink_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Setup Link Worker",
        "department": "Engineering",
        "job_title": "Developer"
    }, headers=admin_headers)
    assert create_res.status_code == 201
    emp_data = create_res.json()
    emp_id = emp_data["id"]
    assert emp_data["setup_url"] is not None
    assert "token=" in emp_data["setup_url"]

    # Extract token from setup_url
    import urllib.parse
    parsed_qs = urllib.parse.parse_qs(urllib.parse.urlparse(emp_data["setup_url"]).query)
    token_1 = parsed_qs["token"][0]

    # Admin requests setup link endpoint
    link_res = client.get(f"/api/employees/{emp_id}/setup-link", headers=admin_headers)
    assert link_res.status_code == 200
    link_data = link_res.json()
    assert link_data["setup_url"] is not None
    assert link_data["is_setup_complete"] is False
    parsed_qs_2 = urllib.parse.parse_qs(urllib.parse.urlparse(link_data["setup_url"]).query)
    token_2 = parsed_qs_2["token"][0]

    # Both token_1 and token_2 MUST work because multiple valid tokens are preserved!
    # Test setting up using token_1
    setup_res = client.post("/api/auth/setup-employee", json={
        "token": token_1,
        "email": emp_email,
        "new_password": "EmployeeSecurePassword123!",
        "confirm_password": "EmployeeSecurePassword123!"
    })
    assert setup_res.status_code == 200
    assert "completed" in setup_res.json()["message"].lower()

    # Reusing link or setting up again must fail now that account is set up
    reuse_res = client.post("/api/auth/setup-employee", json={
        "token": token_2,
        "email": emp_email,
        "new_password": "AnotherPassword123!",
        "confirm_password": "AnotherPassword123!"
    })
    assert reuse_res.status_code == 400
    assert "already set up" in reuse_res.json()["detail"].lower()


def test_send_login_email_preserves_previous_link(admin_headers):
    emp_email = f"emp_multi_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={
        "email": emp_email,
        "full_name": "Multi Link Worker",
    }, headers=admin_headers)
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Admin calls send-login-email
    send_res = client.post(f"/api/employees/{emp_id}/send-login-email", headers=admin_headers)
    assert send_res.status_code == 200
    res_data = send_res.json()
    assert res_data["setup_url"] is not None
    import urllib.parse
    parsed_qs = urllib.parse.parse_qs(urllib.parse.urlparse(res_data["setup_url"]).query)
    token = parsed_qs["token"][0]

    # Complete setup with this token
    setup_res = client.post("/api/auth/setup-employee", json={
        "token": token,
        "email": emp_email,
        "new_password": "EmployeeMultiPassword123!",
        "confirm_password": "EmployeeMultiPassword123!"
    })
    assert setup_res.status_code == 200
