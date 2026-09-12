import uuid
# pyrefly: ignore [missing-import]
import pytest
# pyrefly: ignore [missing-import]
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_user_registration_success():
    unique_email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": unique_email,
        "full_name": "Test User",
        "password": "securepassword123"
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == unique_email
    assert data["full_name"] == "Test User"
    assert "id" in data
    assert "hashed_password" not in data

def test_user_registration_duplicate_email_conflict():
    unique_email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": unique_email,
        "full_name": "Initial User",
        "password": "password123"
    }
    first_res = client.post("/api/auth/register", json=payload)
    assert first_res.status_code == 201

    # Attempting to register with same email in uppercase
    dup_payload = {
        "email": unique_email.upper(),
        "full_name": "Duplicate User",
        "password": "password123"
    }
    response = client.post("/api/auth/register", json=dup_payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]

def test_user_registration_weak_password():
    payload = {
        "email": f"weak_{uuid.uuid4().hex[:8]}@example.com",
        "full_name": "Weak Pwd",
        "password": "123"
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422

def test_login_success():
    email = f"login_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "securepassword123"
    client.post("/api/auth/register", json={
        "email": email,
        "full_name": "Login User",
        "password": pwd
    })

    response = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == email

def test_login_invalid_password():
    email = f"login_fail_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "correctpassword123"
    client.post("/api/auth/register", json={
        "email": email,
        "full_name": "Login Fail User",
        "password": pwd
    })

    response = client.post("/api/auth/login", json={"email": email, "password": "wrongpassword"})
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]

def test_login_nonexistent_user():
    payload = {
        "email": f"nonexistent_{uuid.uuid4().hex[:8]}@example.com",
        "password": "anyPassword123"
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 401

def test_protected_route_unauthorized():
    response = client.get("/api/auth/me")
    assert response.status_code == 401

def test_google_auth_new_user_creation(mocker=None):
    from unittest.mock import patch
    g_id = f"google_id_{uuid.uuid4().hex[:8]}"
    g_email = f"google_{uuid.uuid4().hex[:8]}@example.com"
    
    mock_id_info = {
        "sub": g_id,
        "email": g_email,
        "email_verified": True,
        "name": "Google Test User"
    }

    with patch("app.routers.auth.id_token.verify_oauth2_token", return_value=mock_id_info):
        response = client.post("/api/auth/google", json={"id_token": "mock_valid_google_token"})
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == g_email
        assert data["user"]["google_id"] == g_id
        assert data["user"]["auth_provider"] == "google"

def test_google_auth_account_linking():
    from unittest.mock import patch
    shared_email = f"shared_{uuid.uuid4().hex[:8]}@example.com"
    # Step 1: Create email user
    reg_res = client.post("/api/auth/register", json={
        "email": shared_email,
        "full_name": "Standard User",
        "password": "password123"
    })
    assert reg_res.status_code == 201

    g_id = f"google_link_{uuid.uuid4().hex[:8]}"
    mock_id_info = {
        "sub": g_id,
        "email": shared_email.upper(),
        "email_verified": True,
        "name": "Standard User Google"
    }

    # Step 2: Sign in with Google using same email
    with patch("app.routers.auth.id_token.verify_oauth2_token", return_value=mock_id_info):
        response = client.post("/api/auth/google", json={"id_token": "mock_token_for_linking"})
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == shared_email
        assert data["user"]["google_id"] == g_id

def test_google_auth_invalid_token():
    from unittest.mock import patch
    with patch("app.routers.auth.id_token.verify_oauth2_token", side_effect=ValueError("Token invalid")):
        response = client.post("/api/auth/google", json={"id_token": "invalid_token"})
        assert response.status_code == 401
        assert "Invalid or expired Google ID token" in response.json()["detail"]
