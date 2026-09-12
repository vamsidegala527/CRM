import uuid
# pyrefly: ignore [missing-import]
import pytest
# pyrefly: ignore [missing-import]
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture(scope="module")
def user_a_headers():
    unique_email = f"user_a_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": unique_email,
        "full_name": "User A",
        "password": "UserAPassword123!"
    })
    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": "UserAPassword123!"
    })
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module")
def user_b_headers():
    unique_email = f"user_b_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": unique_email,
        "full_name": "User B",
        "password": "UserBPassword123!"
    })
    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": "UserBPassword123!"
    })
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_chatbot_unauthenticated_request_rejected():
    res = client.get("/api/customers")
    assert res.status_code == 401
    assert "detail" in res.json()


def test_chatbot_invalid_token_rejected():
    res = client.get("/api/customers", headers={"Authorization": "Bearer invalid_jwt_token_12345"})
    assert res.status_code == 401


def test_chatbot_user_a_creates_customer(user_a_headers):
    unique_email = f"cust_a_{uuid.uuid4().hex[:8]}@acme.com"
    res = client.post("/api/customers", headers=user_a_headers, json={
        "name": "Customer User A",
        "email": unique_email,
        "phone": "9876543210",
        "company": "Acme User A Corp"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Customer User A"


def test_chatbot_multi_user_data_isolation(user_a_headers, user_b_headers):
    # User A creates a customer
    unique_email = f"isolated_{uuid.uuid4().hex[:8]}@acme.com"
    create_res = client.post("/api/customers", headers=user_a_headers, json={
        "name": "Isolated Customer A",
        "email": unique_email,
        "phone": "5551234567"
    })
    assert create_res.status_code == 201
    cust_id = create_res.json()["id"]

    # User B lists customers -> Should NOT see User A's customer
    user_b_list = client.get("/api/customers", headers=user_b_headers)
    assert user_b_list.status_code == 200
    user_b_cust_ids = [c["id"] for c in user_b_list.json()["items"]]
    assert cust_id not in user_b_cust_ids

    # User B tries to GET User A's customer by ID -> 404 Not Found
    get_res = client.get(f"/api/customers/{cust_id}", headers=user_b_headers)
    assert get_res.status_code == 404

    # User B tries to UPDATE User A's customer -> 404 Not Found
    update_res = client.put(f"/api/customers/{cust_id}", headers=user_b_headers, json={"name": "Hacked Name"})
    assert update_res.status_code == 404

    # User B tries to DELETE User A's customer -> 404 Not Found
    delete_res = client.delete(f"/api/customers/{cust_id}", headers=user_b_headers)
    assert delete_res.status_code == 404

    # User A can successfully retrieve and delete their own customer
    user_a_get = client.get(f"/api/customers/{cust_id}", headers=user_a_headers)
    assert user_a_get.status_code == 200

    user_a_del = client.delete(f"/api/customers/{cust_id}", headers=user_a_headers)
    assert user_a_del.status_code == 200


def test_chatbot_search_customers_filter(user_a_headers):
    unique_keyword = f"Kwdcorp{uuid.uuid4().hex[:6]}"
    res = client.post("/api/customers", headers=user_a_headers, json={
        "name": "Searchable Customer",
        "email": f"{unique_keyword.lower()}@search.com",
        "phone": "9876543210",
        "company": unique_keyword
    })
    assert res.status_code == 201

    # Search with company keyword
    search_res = client.get(f"/api/customers?search={unique_keyword}", headers=user_a_headers)
    assert search_res.status_code == 200
    items = search_res.json()["items"]
    assert any(c["company"] == unique_keyword for c in items)


def test_chatbot_update_customer(user_a_headers):
    # Create customer
    create_res = client.post("/api/customers", headers=user_a_headers, json={
        "name": "Updatable Customer",
        "email": f"update_{uuid.uuid4().hex[:8]}@acme.com",
        "phone": "1234567890",
        "status": "Lead"
    })
    assert create_res.status_code == 201
    cust_id = create_res.json()["id"]

    # Update phone and status
    update_res = client.put(f"/api/customers/{cust_id}", headers=user_a_headers, json={
        "phone": "9998887777",
        "status": "Active"
    })
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["phone"] == "9998887777"
    assert data["status"] == "Active"


def test_chatbot_validation_handling(user_a_headers):
    # Invalid email format should be rejected with 422
    res = client.post("/api/customers", headers=user_a_headers, json={
        "name": "Invalid Customer",
        "email": "not-an-email",
        "phone": "1234567890"
    })
    assert res.status_code == 422

