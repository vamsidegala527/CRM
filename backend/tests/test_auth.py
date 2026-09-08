import uuid
import pytest
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
