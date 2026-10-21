import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.models import User
from app.auth import get_password_hash
from app.rate_limiter import limiter, metrics
from app.config import settings

# In-memory SQLite database setup for route testing
sqlite_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sqlite_engine)
Base.metadata.create_all(bind=sqlite_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Clear limiter state between tests
    with limiter._lock:
        limiter._buckets.clear()
        limiter._sliding_windows.clear()
        limiter._failed_logins.clear()
    db = TestingSessionLocal()
    # Clean users table
    db.query(User).delete()
    db.commit()
    db.close()
    yield


def test_api_health_rate_limiter_telemetry():
    """Verify that /api/health exposes rate limiter health telemetry without exposing secrets."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "rate_limiter" in data
    rl = data["rate_limiter"]
    assert "backend_status" in rl
    assert "total_allowed" in rl
    assert "total_denied" in rl
    assert "redis_errors_count" in rl


def test_login_ip_spray_rate_limiting():
    """Verify that excessive login attempts from a single IP are throttled via IP sliding window."""
    # Custom IP to isolate test
    headers = {"X-App-Client-IP": "198.51.100.123"}
    max_requests = settings.RATE_LIMIT_LOGIN_IP_MAX_REQUESTS

    # Exhaust the IP allowance
    for i in range(max_requests):
        res = client.post("/api/auth/login", json={"email": f"test_{i}@company.com", "password": "wrong"}, headers=headers)
        # First max_requests should return 404 (user not found)
        assert res.status_code == 404

    # The (max_requests + 1)-th attempt from this IP must trigger HTTP 429
    res_blocked = client.post("/api/auth/login", json={"email": "another@company.com", "password": "wrong"}, headers=headers)
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers
    assert res_blocked.headers.get("RateLimit-Policy") == "login_ip_spray"
    data = res_blocked.json()
    assert "Too many sign-in attempts" in data["detail"]



def test_login_progressive_account_lockout_and_recovery():
    """Verify that an account is locked after exceeding max failures and unlocks on valid credentials."""
    # Create test user in DB
    db = TestingSessionLocal()
    test_email = "victim.employee@company.com"
    user = User(
        email=test_email,
        full_name="Victim Employee",
        hashed_password=get_password_hash("CorrectPassword123!"),
        role="employee",
        is_active=True,
        is_setup_complete=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.close()

    # Use rotating IPs to simulate distributed brute-force targeting one account
    max_failures = settings.RATE_LIMIT_MAX_FAILURES

    for i in range(max_failures):
        ip = f"203.0.113.{i+1}"
        res = client.post(
            "/api/auth/login",
            json={"email": test_email, "password": "WrongPassword!"},
            headers={"X-App-Client-IP": ip}
        )
        assert res.status_code == 401

    # Next attempt should be rejected with 429 Account Lockout BEFORE password verification
    res_locked = client.post(
        "/api/auth/login",
        json={"email": test_email, "password": "WrongPassword!"},
        headers={"X-App-Client-IP": "203.0.113.99"}
    )
    assert res_locked.status_code == 429
    assert "Account temporarily locked" in res_locked.json()["detail"]
    assert "Retry-After" in res_locked.headers

    # Another innocent account on the same network is NOT locked out
    db = TestingSessionLocal()
    innocent_email = "innocent.colleague@company.com"
    innocent_user = User(
        email=innocent_email,
        full_name="Innocent Colleague",
        hashed_password=get_password_hash("ColleaguePassword123!"),
        role="employee",
        is_active=True,
        is_setup_complete=True,
        is_verified=True,
    )
    db.add(innocent_user)
    db.commit()
    db.close()

    res_innocent = client.post(
        "/api/auth/login",
        json={"email": innocent_email, "password": "ColleaguePassword123!"},
        headers={"X-App-Client-IP": "203.0.113.99"}
    )
    assert res_innocent.status_code == 200, "Innocent account must not be locked out"
    assert "access_token" in res_innocent.json()

    # Valid password entered by legitimate user succeeds immediately and clears failure tracker
    res_valid = client.post(
        "/api/auth/login",
        json={"email": test_email, "password": "CorrectPassword123!"},
        headers={"X-App-Client-IP": "203.0.113.100"}
    )
    assert res_valid.status_code == 200, "Legitimate user with valid password must always be able to log in"
    assert "access_token" in res_valid.json()

