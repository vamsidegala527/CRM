import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture(scope="module")
def admin_headers():
    admin_email = f"admin_rbac_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": admin_email,
        "full_name": "RBAC Admin",
        "password": "adminpassword123",
        "role": "admin"
    })
    
    login_res = client.post("/api/auth/login", json={
        "email": admin_email,
        "password": "adminpassword123"
    })
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def normal_user_headers():
    user_email = f"normal_user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={
        "email": user_email,
        "full_name": "Normal User",
        "password": "userpassword123",
        "role": "user"
    })
    
    login_res = client.post("/api/auth/login", json={
        "email": user_email,
        "password": "userpassword123"
    })
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_normal_user_data_isolation(admin_headers, normal_user_headers):
    # Admin creates a customer
    admin_cust = client.post("/api/customers", json={
        "name": "Admin Secret Client",
        "email": f"admin_secret_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Active"
    }, headers=admin_headers).json()

    # Normal user creates a customer
    user_cust = client.post("/api/customers", json={
        "name": "Normal User Client",
        "email": f"normal_cust_{uuid.uuid4().hex[:8]}@example.com",
        "status": "Lead"
    }, headers=normal_user_headers).json()

    # Normal user fetches customer list -> should see user_cust, but NOT admin_cust
    res = client.get("/api/customers", headers=normal_user_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    item_ids = [c["id"] for c in items]

    assert user_cust["id"] in item_ids
    assert admin_cust["id"] not in item_ids


def test_normal_user_get_other_customer_forbidden(admin_headers, normal_user_headers):
    # Admin creates customer
    admin_cust = client.post("/api/customers", json={
        "name": "Admin Protected Client",
        "email": f"admin_prot_{uuid.uuid4().hex[:8]}@example.com",
    }, headers=admin_headers).json()

    # Normal user attempts to read admin's customer
    res = client.get(f"/api/customers/{admin_cust['id']}", headers=normal_user_headers)
    assert res.status_code == 403
    assert "do not own" in res.json()["detail"].lower()


def test_normal_user_update_other_customer_forbidden(admin_headers, normal_user_headers):
    admin_cust = client.post("/api/customers", json={
        "name": "Admin Editable Client",
        "email": f"admin_edit_{uuid.uuid4().hex[:8]}@example.com",
    }, headers=admin_headers).json()

    # Normal user attempts to modify admin's customer
    res = client.put(f"/api/customers/{admin_cust['id']}", json={"name": "Hacked Name"}, headers=normal_user_headers)
    assert res.status_code == 403
    assert "cannot modify another user" in res.json()["detail"].lower()


def test_normal_user_delete_other_customer_forbidden(admin_headers, normal_user_headers):
    admin_cust = client.post("/api/customers", json={
        "name": "Admin Deletable Client",
        "email": f"admin_del_{uuid.uuid4().hex[:8]}@example.com",
    }, headers=admin_headers).json()

    # Normal user attempts to delete admin's customer
    res = client.delete(f"/api/customers/{admin_cust['id']}", headers=normal_user_headers)
    assert res.status_code == 403
    assert "cannot delete another user" in res.json()["detail"].lower()


def test_normal_user_access_admin_api_forbidden(normal_user_headers):
    # Normal user tries calling GET /api/users
    res = client.get("/api/users", headers=normal_user_headers)
    assert res.status_code == 403
    assert "admin privileges required" in res.json()["detail"].lower()


def test_normal_user_update_role_forbidden(normal_user_headers):
    # Normal user tries elevating role to admin
    me_res = client.get("/api/auth/me", headers=normal_user_headers).json()
    user_id = me_res["id"]

    res = client.put(f"/api/users/{user_id}/role", json={"role": "admin"}, headers=normal_user_headers)
    assert res.status_code == 403


def test_admin_user_full_access(admin_headers, normal_user_headers):
    # Normal user creates customer
    user_cust = client.post("/api/customers", json={
        "name": "User Owned Client",
        "email": f"user_owned_{uuid.uuid4().hex[:8]}@example.com",
    }, headers=normal_user_headers).json()

    # Admin can GET user's customer
    get_res = client.get(f"/api/customers/{user_cust['id']}", headers=admin_headers)
    assert get_res.status_code == 200

    # Admin can PUT user's customer
    put_res = client.put(f"/api/customers/{user_cust['id']}", json={"status": "Inactive"}, headers=admin_headers)
    assert put_res.status_code == 200
    assert put_res.json()["status"] == "Inactive"

    # Admin can DELETE user's customer
    del_res = client.delete(f"/api/customers/{user_cust['id']}", headers=admin_headers)
    assert del_res.status_code == 200


def test_admin_user_list_all_users(admin_headers):
    res = client.get("/api/users", headers=admin_headers)
    assert res.status_code == 200
    users = res.json()
    assert isinstance(users, list)
    assert len(users) >= 2


def test_admin_update_user_role_and_status(admin_headers):
    # Create target user
    target_email = f"target_user_{uuid.uuid4().hex[:8]}@example.com"
    target = client.post("/api/auth/register", json={
        "email": target_email,
        "full_name": "Target User",
        "password": "password123",
        "role": "user"
    }).json()

    # Promote to admin
    role_res = client.put(f"/api/users/{target['id']}/role", json={"role": "admin"}, headers=admin_headers)
    assert role_res.status_code == 200
    assert role_res.json()["role"] == "admin"

    # Demote back to user
    role_res2 = client.put(f"/api/users/{target['id']}/role", json={"role": "user"}, headers=admin_headers)
    assert role_res2.status_code == 200
    assert role_res2.json()["role"] == "user"

    # Toggle status inactive
    status_res = client.put(f"/api/users/{target['id']}/status", json={"is_active": False}, headers=admin_headers)
    assert status_res.status_code == 200
    assert status_res.json()["is_active"] == False
