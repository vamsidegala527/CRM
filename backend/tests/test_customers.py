import uuid
# pyrefly: ignore [missing-import]
import pytest
# pyrefly: ignore [missing-import]
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
        "status": "Active Customer",
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
    letters_only = "".join(c for c in uuid.uuid4().hex if c.isalpha())[:6]
    unique_name = f"SearchTarget{letters_only}"
    create_res = client.post("/api/customers", json={
        "name": unique_name,
        "email": f"search_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Active"
    }, headers=auth_headers)
    assert create_res.status_code == 201

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


# Data Isolation & Security Verification Tests
def test_newly_registered_user_starts_with_clean_data():
    """Verify that a brand new user starts with 0 customers."""
    new_user_email = f"clean_user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": new_user_email,
        "full_name": "Clean Slate User",
        "password": "cleanpassword123"
    })
    login_res = client.post("/api/auth/login", json={
        "email": new_user_email,
        "password": "cleanpassword123"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/customers", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_multi_user_data_isolation():
    """Verify that User A cannot see, access, modify, or delete User B's customers."""
    user_a_email = f"user_a_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": user_a_email,
        "full_name": "User Alpha",
        "password": "userapassword123"
    })
    token_a = client.post("/api/auth/login", json={"email": user_a_email, "password": "userapassword123"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    user_b_email = f"user_b_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": user_b_email,
        "full_name": "User Beta",
        "password": "userbpassword123"
    })
    token_b = client.post("/api/auth/login", json={"email": user_b_email, "password": "userbpassword123"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    create_res = client.post("/api/customers", json={
        "name": "Alpha Confidential Customer",
        "email": f"secret_{uuid.uuid4().hex[:8]}@alpha.com",
        "company": "Alpha Corp",
        "status": "Active"
    }, headers=headers_a)
    assert create_res.status_code == 201
    cust_a_id = create_res.json()["id"]

    list_b_res = client.get("/api/customers", headers=headers_b)
    assert list_b_res.status_code == 200
    items_b = list_b_res.json()["items"]
    assert not any(c["id"] == cust_a_id for c in items_b)

    get_b_res = client.get(f"/api/customers/{cust_a_id}", headers=headers_b)
    assert get_b_res.status_code == 404

    put_b_res = client.put(f"/api/customers/{cust_a_id}", json={"name": "Hacked by User B"}, headers=headers_b)
    assert put_b_res.status_code == 404

    del_b_res = client.delete(f"/api/customers/{cust_a_id}", headers=headers_b)
    assert del_b_res.status_code == 404

    get_a_res = client.get(f"/api/customers/{cust_a_id}", headers=headers_a)
    assert get_a_res.status_code == 200
    assert get_a_res.json()["name"] == "Alpha Confidential Customer"


# Comprehensive Form Input Validation Tests
def test_validation_invalid_name_symbols_and_numbers(auth_headers):
    """Verify full name with numbers/symbols is rejected with 422."""
    res = client.post("/api/customers", json={
        "name": "Jane Doe 123!",
        "email": f"val_name_{uuid.uuid4().hex[:8]}@example.com"
    }, headers=auth_headers)
    assert res.status_code == 422
    assert "only contain letters" in str(res.json()).lower()


def test_validation_invalid_name_too_short(auth_headers):
    """Verify single-letter or whitespace name is rejected."""
    res = client.post("/api/customers", json={
        "name": " J ",
        "email": f"val_shortname_{uuid.uuid4().hex[:8]}@example.com"
    }, headers=auth_headers)
    assert res.status_code == 422


def test_validation_invalid_name_too_long(auth_headers):
    """Verify name > 100 characters is rejected."""
    long_name = "A" * 101
    res = client.post("/api/customers", json={
        "name": long_name,
        "email": f"val_longname_{uuid.uuid4().hex[:8]}@example.com"
    }, headers=auth_headers)
    assert res.status_code == 422


def test_validation_invalid_email_format(auth_headers):
    """Verify bad email format is rejected."""
    res = client.post("/api/customers", json={
        "name": "Valid Name",
        "email": "notanemailaddress"
    }, headers=auth_headers)
    assert res.status_code == 422


def test_validation_invalid_phone_characters(auth_headers):
    """Verify phone with letters or invalid characters is rejected."""
    res = client.post("/api/customers", json={
        "name": "Valid Name",
        "email": f"val_phone_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "+1 (555) CALL-NOW"
    }, headers=auth_headers)
    assert res.status_code == 422


def test_validation_invalid_phone_too_few_digits(auth_headers):
    """Verify phone with fewer than 7 digits is rejected."""
    res = client.post("/api/customers", json={
        "name": "Valid Name",
        "email": f"val_shortphone_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "12345"
    }, headers=auth_headers)
    assert res.status_code == 422


def test_validation_status_label_normalization(auth_headers):
    """Verify 'Sales Lead' and 'Active Customer' map correctly to Lead and Active."""
    res = client.post("/api/customers", json={
        "name": "Lead Customer",
        "email": f"val_lead_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Sales Lead"
    }, headers=auth_headers)
    assert res.status_code == 201
    assert res.json()["status"] == "Lead"


def test_validation_over_length_optional_fields(auth_headers):
    """Verify over-length company (>100), address (>300), notes (>1000) are rejected."""
    res_company = client.post("/api/customers", json={
        "name": "Valid Name",
        "email": f"val_company_{uuid.uuid4().hex[:8]}@example.com",
        "company": "C" * 101
    }, headers=auth_headers)
    assert res_company.status_code == 422

    res_address = client.post("/api/customers", json={
        "name": "Valid Name",
        "email": f"val_addr_{uuid.uuid4().hex[:8]}@example.com",
        "address": "A" * 301
    }, headers=auth_headers)
    assert res_address.status_code == 422

    res_notes = client.post("/api/customers", json={
        "name": "Valid Name",
        "email": f"val_notes_{uuid.uuid4().hex[:8]}@example.com",
        "notes": "N" * 1001
    }, headers=auth_headers)
    assert res_notes.status_code == 422


def test_validation_boundary_values(auth_headers):
    """Verify exact boundary values (2 char name, 100 char name, 7-digit phone, 15-digit phone)."""
    # Min length name (2 chars) & min digits phone (7 digits)
    res_min = client.post("/api/customers", json={
        "name": "Ab",
        "email": f"val_bound_min_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "1234567"
    }, headers=auth_headers)
    assert res_min.status_code == 201
    assert res_min.json()["name"] == "Ab"
    assert res_min.json()["phone"] == "1234567"

    # Max length name (100 chars) & max digits phone (15 digits)
    max_name = "A" * 100
    res_max = client.post("/api/customers", json={
        "name": max_name,
        "email": f"val_bound_max_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "+1 (555) 123-456789"
    }, headers=auth_headers)
    assert res_max.status_code == 201
    assert res_max.json()["name"] == max_name
