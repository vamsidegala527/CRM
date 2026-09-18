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
    email = f"admin_crud_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "AdminSecurePassword123!"
    reg = client.post("/api/auth/register", json={"email": email, "full_name": "Admin CRUD", "password": pwd})
    assert reg.status_code == 201

    login = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"headers": {"Authorization": f"Bearer {token}"}, "id": login.json()["user"]["id"], "email": email}


@pytest.fixture(scope="module")
def admin_headers(admin_user):
    return admin_user["headers"]


def test_01_create_employee_with_extended_fields(admin_headers):
    unique_suffix = uuid.uuid4().hex[:8]
    email = f"emp_ext_{unique_suffix}@example.com"
    payload = {
        "email": email,
        "full_name": f"Alex Morgan {unique_suffix}",
        "department": "Engineering",
        "job_title": "Senior Cloud Architect",
        "company": "Enterprise Global Corp",
        "address": "456 Innovation Way, Suite 800",
        "phone": "+1 (555) 789-0123",
        "notes": "Key specialist for AWS and GCP infrastructure."
    }
    res = client.post("/api/employees", json=payload, headers=admin_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == email.lower()
    assert data["full_name"] == payload["full_name"]
    assert data["company"] == payload["company"]
    assert data["address"] == payload["address"]
    assert data["notes"] == payload["notes"]
    assert data["phone"] == payload["phone"]
    assert data["department"] == payload["department"]
    assert data["job_title"] == payload["job_title"]
    assert data["role"] == "employee"
    assert data["is_active"] is True
    assert data["is_setup_complete"] is False
    assert data["public_id"] and len(data["public_id"]) > 10


def test_02_update_employee_admin(admin_headers):
    unique_suffix = uuid.uuid4().hex[:8]
    email = f"emp_upd_{unique_suffix}@example.com"
    create_res = client.post("/api/employees", json={
        "email": email,
        "full_name": "Initial Name",
        "department": "Sales"
    }, headers=admin_headers)
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    update_res = client.put(f"/api/employees/{emp_id}", json={
        "full_name": "Updated Name",
        "department": "Solutions Architecture",
        "job_title": "Principal Architect",
        "company": "Acme Ventures",
        "address": "999 Silicon Alley",
        "phone": "+1 (555) 321-7654",
        "notes": "Promoted to Principal Architect."
    }, headers=admin_headers)
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["full_name"] == "Updated Name"
    assert data["department"] == "Solutions Architecture"
    assert data["job_title"] == "Principal Architect"
    assert data["company"] == "Acme Ventures"
    assert data["address"] == "999 Silicon Alley"
    assert data["phone"] == "+1 (555) 321-7654"
    assert data["notes"] == "Promoted to Principal Architect."


def test_03_seven_field_search(admin_headers):
    unique_tag = "".join(secrets.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(6))
    email = f"searchable_{unique_tag}@example.com"
    full_name = f"SearchTarget {unique_tag}"
    department = f"Dept_{unique_tag}"
    job_title = f"Title_{unique_tag}"
    phone = f"+1 (555) 000-{secrets.randbelow(9000)+1000}"
    company = f"Corp_{unique_tag}"

    create_res = client.post("/api/employees", json={
        "email": email,
        "full_name": full_name,
        "department": department,
        "job_title": job_title,
        "phone": phone,
        "company": company
    }, headers=admin_headers)
    assert create_res.status_code == 201
    created = create_res.json()
    public_id = created["public_id"]

    # 1. Search by full_name
    r1 = client.get(f"/api/employees?search={full_name}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r1.json())

    # 2. Search by email
    r2 = client.get(f"/api/employees?search={email}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r2.json())

    # 3. Search by department
    r3 = client.get(f"/api/employees?search={department}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r3.json())

    # 4. Search by job_title
    r4 = client.get(f"/api/employees?search={job_title}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r4.json())

    # 5. Search by phone
    r5 = client.get(f"/api/employees?search={phone}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r5.json())

    # 6. Search by company
    r6 = client.get(f"/api/employees?search={company}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r6.json())

    # 7. Search by public_id
    r7 = client.get(f"/api/employees?search={public_id}", headers=admin_headers)
    assert any(e["id"] == created["id"] for e in r7.json())


def test_04_two_independent_status_filters(admin_headers):
    tag = uuid.uuid4().hex[:6]
    db: Session = next(get_db())
    try:
        # Create 4 employees to represent all 4 combinations
        # 1. Active + Pending
        e1_res = client.post("/api/employees", json={"email": f"a_pend_{tag}@example.com", "full_name": f"A Pend {tag}"}, headers=admin_headers)
        e1_id = e1_res.json()["id"]

        # 2. Active + Completed
        e2_res = client.post("/api/employees", json={"email": f"a_comp_{tag}@example.com", "full_name": f"A Comp {tag}"}, headers=admin_headers)
        e2_id = e2_res.json()["id"]
        u2 = db.query(User).filter(User.id == e2_id).first()
        u2.is_setup_complete = True
        db.commit()

        # 3. Inactive + Pending
        e3_res = client.post("/api/employees", json={"email": f"i_pend_{tag}@example.com", "full_name": f"I Pend {tag}"}, headers=admin_headers)
        e3_id = e3_res.json()["id"]
        client.delete(f"/api/employees/{e3_id}?permanent=false", headers=admin_headers)

        # 4. Inactive + Completed
        e4_res = client.post("/api/employees", json={"email": f"i_comp_{tag}@example.com", "full_name": f"I Comp {tag}"}, headers=admin_headers)
        e4_id = e4_res.json()["id"]
        u4 = db.query(User).filter(User.id == e4_id).first()
        u4.is_setup_complete = True
        db.commit()
        client.delete(f"/api/employees/{e4_id}?permanent=false", headers=admin_headers)
    finally:
        db.close()

    # Test Active + Pending
    r_ap = client.get(f"/api/employees?search={tag}&account_status=Active&setup_status=Pending", headers=admin_headers)
    ids_ap = [e["id"] for e in r_ap.json()]
    assert e1_id in ids_ap
    assert e2_id not in ids_ap
    assert e3_id not in ids_ap
    assert e4_id not in ids_ap

    # Test Active + Completed
    r_ac = client.get(f"/api/employees?search={tag}&account_status=Active&setup_status=Completed", headers=admin_headers)
    ids_ac = [e["id"] for e in r_ac.json()]
    assert e2_id in ids_ac
    assert e1_id not in ids_ac
    assert e3_id not in ids_ac
    assert e4_id not in ids_ac

    # Test Inactive + Pending
    r_ip = client.get(f"/api/employees?search={tag}&account_status=Inactive&setup_status=Pending", headers=admin_headers)
    ids_ip = [e["id"] for e in r_ip.json()]
    assert e3_id in ids_ip
    assert e1_id not in ids_ip
    assert e2_id not in ids_ip
    assert e4_id not in ids_ip

    # Test Inactive + Completed
    r_ic = client.get(f"/api/employees?search={tag}&account_status=Inactive&setup_status=Completed", headers=admin_headers)
    ids_ic = [e["id"] for e in r_ic.json()]
    assert e4_id in ids_ic
    assert e1_id not in ids_ic
    assert e2_id not in ids_ic
    assert e3_id not in ids_ic


def test_05_five_kpi_metrics_endpoint(admin_headers):
    res = client.get("/api/employees/metrics", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_employees" in data
    assert "active_staff" in data
    assert "inactive_staff" in data
    assert "setup_pending" in data
    assert "setup_completed" in data

    # Verify arithmetic integrity
    assert data["total_employees"] == data["active_staff"] + data["inactive_staff"]
    assert data["total_employees"] == data["setup_pending"] + data["setup_completed"]


def test_06_soft_deactivation_default(admin_headers):
    email = f"emp_soft_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={"email": email, "full_name": "Soft Deact Target"}, headers=admin_headers)
    assert create_res.status_code == 201
    emp_id = create_res.json()["id"]

    # Deactivate without permanent parameter (default permanent=false)
    deact_res = client.delete(f"/api/employees/{emp_id}", headers=admin_headers)
    assert deact_res.status_code == 200

    # Verify employee still exists in list under Inactive
    view_res = client.get(f"/api/employees/{emp_id}", headers=admin_headers)
    assert view_res.status_code == 200
    assert view_res.json()["is_active"] is False


def test_07_reactivation(admin_headers):
    email = f"emp_react_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={"email": email, "full_name": "Reactivate Tester"}, headers=admin_headers)
    emp_id = create_res.json()["id"]

    # Deactivate
    client.delete(f"/api/employees/{emp_id}", headers=admin_headers)

    # Reactivate
    react_res = client.post(f"/api/employees/{emp_id}/reactivate", headers=admin_headers)
    assert react_res.status_code == 200
    assert react_res.json()["is_active"] is True


def test_08_permanent_deletion_requires_confirmed_true(admin_headers):
    email = f"emp_perm_{uuid.uuid4().hex[:8]}@example.com"
    create_res = client.post("/api/employees", json={"email": email, "full_name": "Perm Delete Target"}, headers=admin_headers)
    emp_id = create_res.json()["id"]

    # Attempt permanent delete without confirmed=true -> 400 Bad Request
    unconfirmed_res = client.delete(f"/api/employees/{emp_id}?permanent=true", headers=admin_headers)
    assert unconfirmed_res.status_code == 400
    assert "confirmed=true" in unconfirmed_res.json()["detail"]

    # Permanent delete WITH confirmed=true -> 200 OK
    confirmed_res = client.delete(f"/api/employees/{emp_id}?permanent=true&confirmed=true", headers=admin_headers)
    assert confirmed_res.status_code == 200
    assert "permanently deleted" in confirmed_res.json()["message"]

    # Verify record is completely removed from DB
    get_res = client.get(f"/api/employees/{emp_id}", headers=admin_headers)
    assert get_res.status_code == 404


def test_09_cannot_delete_admin_or_self(admin_user, admin_headers):
    # Attempt to deactivate or delete self
    self_res = client.delete(f"/api/employees/{admin_user['id']}", headers=admin_headers)
    assert self_res.status_code == 400
    assert "cannot" in self_res.json()["detail"].lower()
