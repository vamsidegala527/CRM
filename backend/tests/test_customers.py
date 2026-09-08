import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture(scope="module")
def auth_headers():
    unique_email = f"cust_tester_{uuid.uuid4().hex[:8]}@example.com"
    user_payload = {
        "email": unique_email,
        "full_name": "Customer Tester",
        "password": "custpassword123"
    }
    client.post("/api/auth/register", json=user_payload)
    
    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": "custpassword123"
    })
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_customers_unauthorized():
    response = client.get("/api/customers")
    assert response.status_code == 401


def test_create_customer_success(auth_headers):
    unique_email = f"harker_{uuid.uuid4().hex[:8]}@transylvania.com"
    payload = {
        "name": "  Jonathan Harker  ",
        "email": f"  {unique_email.upper()}  ",
        "phone": "+1 (555) 998-1122",
        "company": "  Transylvania Real Estate  ",
        "address": "45 Castle Way, Bran, Romania",
        "status": "active",
        "notes": "  High priority client.  "
    }
    response = client.post("/api/customers", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Jonathan Harker"
    assert data["email"] == unique_email.lower()
    assert data["status"] == "Active"
    assert data["company"] == "Transylvania Real Estate"
    assert data["notes"] == "High priority client."
    assert "id" in data


def test_create_customer_duplicate_email_conflict(auth_headers):
    unique_email = f"dup_cust_{uuid.uuid4().hex[:8]}@example.com"
    initial_res = client.post("/api/customers", json={
        "name": "Initial Harker",
        "email": unique_email,
        "status": "Lead"
    }, headers=auth_headers)
    assert initial_res.status_code == 201

    payload = {
        "name": "Another Harker",
        "email": unique_email.upper(),
        "phone": "+1 (555) 111-2233",
        "company": "Other Corp",
        "status": "Lead"
    }
    response = client.post("/api/customers", json=payload, headers=auth_headers)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_create_customer_invalid_phone(auth_headers):
    payload = {
        "name": "Bad Phone Client",
        "email": f"badphone_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "invalid_phone_123_abc",
        "status": "Active"
    }
    response = client.post("/api/customers", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_create_customer_invalid_status(auth_headers):
    payload = {
        "name": "Bad Status Client",
        "email": f"badstatus_{uuid.uuid4().hex[:8]}@example.com",
        "status": "UnknownStatus"
    }
    response = client.post("/api/customers", json=payload, headers=auth_headers)
    assert response.status_code == 422


def test_get_customers_list(auth_headers):
    response = client.get("/api/customers", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "items" in data
    assert isinstance(data["items"], list)
    assert data["total"] >= 1


def test_get_customers_search_filter(auth_headers):
    unique_name = f"SearchTarget_{uuid.uuid4().hex[:6]}"
    client.post("/api/customers", json={
        "name": unique_name,
        "email": f"search_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Active"
    }, headers=auth_headers)

    response = client.get(f"/api/customers?search={unique_name}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any(unique_name in c["name"] for c in data["items"])


def test_get_customer_by_id_success(auth_headers):
    create_res = client.post("/api/customers", json={
        "name": "Inspector Target",
        "email": f"inspector_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Lead"
    }, headers=auth_headers)
    assert create_res.status_code == 201
    cust_id = create_res.json()["id"]

    response = client.get(f"/api/customers/{cust_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == cust_id
    assert data["name"] == "Inspector Target"


def test_get_customer_by_id_not_found(auth_headers):
    response = client.get("/api/customers/999999", headers=auth_headers)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_update_customer_success(auth_headers):
    create_res = client.post("/api/customers", json={
        "name": "Update Target",
        "email": f"update_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Prospect"
    }, headers=auth_headers)
    assert create_res.status_code == 201
    cust_id = create_res.json()["id"]

    update_payload = {
        "name": "Updated Target Name",
        "status": "Active",
        "company": "New Upgraded Company"
    }
    response = client.put(f"/api/customers/{cust_id}", json=update_payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Target Name"
    assert data["status"] == "Active"
    assert data["company"] == "New Upgraded Company"


def test_update_customer_duplicate_email_conflict(auth_headers):
    email1 = f"cust1_{uuid.uuid4().hex[:8]}@example.com"
    email2 = f"cust2_{uuid.uuid4().hex[:8]}@example.com"

    c1 = client.post("/api/customers", json={
        "name": "Cust One",
        "email": email1,
    }, headers=auth_headers).json()

    c2 = client.post("/api/customers", json={
        "name": "Cust Two",
        "email": email2,
    }, headers=auth_headers).json()

    # Try updating c2 with c1's email
    response = client.put(f"/api/customers/{c2['id']}", json={"email": email1}, headers=auth_headers)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_delete_customer_success(auth_headers):
    create_res = client.post("/api/customers", json={
        "name": "Delete Target",
        "email": f"delete_{uuid.uuid4().hex[:8]}@example.com",
    }, headers=auth_headers)
    assert create_res.status_code == 201
    cust_id = create_res.json()["id"]

    del_res = client.delete(f"/api/customers/{cust_id}", headers=auth_headers)
    assert del_res.status_code == 200
    assert "deleted successfully" in del_res.json()["message"]

    # Verify 404 after deletion
    get_res = client.get(f"/api/customers/{cust_id}", headers=auth_headers)
    assert get_res.status_code == 404


def test_delete_customer_not_found(auth_headers):
    response = client.delete("/api/customers/999999", headers=auth_headers)
    assert response.status_code == 404
