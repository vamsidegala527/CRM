import time
from fastapi import HTTPException
from app.rate_limiter import TokenBucket, SlidingWindowTracker, RateLimiter, get_client_ip


def test_token_bucket_burst_and_replenishment():
    """Test that Token Bucket allows bursts up to capacity and replenishes over time."""
    capacity = 10
    fill_rate = 2.0  # 2 tokens per second
    t0 = 1000.0
    bucket = TokenBucket(capacity=capacity, fill_rate=fill_rate, now=t0)

    # 1. Burst of 10 requests should all succeed
    for i in range(10):
        allowed, rem, reset_secs = bucket.consume(1.0, now=t0)
        assert allowed is True
        assert rem == (9 - i)

    # 2. 11th request immediately at t0 should be denied
    allowed, rem, retry_after = bucket.consume(1.0, now=t0)
    assert allowed is False
    assert rem == 0
    assert retry_after >= 1

    # 3. Advance time by 2.5 seconds -> 5 tokens replenished
    t1 = t0 + 2.5
    allowed, rem, _ = bucket.consume(1.0, now=t1)
    assert allowed is True
    assert rem == 4  # 5 replenished - 1 consumed = 4 remaining


def test_sliding_window_tracker():
    """Test that SlidingWindowTracker enforces strict action limits."""
    window = 60
    max_req = 3
    t0 = 2000.0
    tracker = SlidingWindowTracker(window_seconds=window)

    # 3 requests succeed
    assert tracker.check_and_add(max_requests=max_req, now=t0)[0] is True
    assert tracker.check_and_add(max_requests=max_req, now=t0 + 10)[0] is True
    assert tracker.check_and_add(max_requests=max_req, now=t0 + 20)[0] is True

    # 4th request within window fails
    allowed, rem, retry_after = tracker.check_and_add(max_requests=max_req, now=t0 + 30)
    assert allowed is False
    assert retry_after == 30  # 60 - (30 - 0) = 30s remaining

    # Advance past the oldest timestamp (t0 + 65) -> allowed again
    allowed, rem, _ = tracker.check_and_add(max_requests=max_req, now=t0 + 65)
    assert allowed is True


def test_account_lockout_and_isolation():
    """Test brute-force login lockout per account and verify loopback immunity & account isolation."""
    limiter = RateLimiter()
    email_a = "victim@company.com"
    email_b = "innocent@company.com"
    ip = "203.0.113.50"

    # 1. Normal state: no lockout
    limiter.check_login_lockout(email=email_a, ip=ip)
    limiter.check_login_lockout(email=email_b, ip=ip)

    # 2. Record 5 failed logins for email_a (threshold=5)
    for _ in range(5):
        limiter.record_login_failure(email=email_a, ip=ip, max_failures=5, lockout_seconds=30, window_seconds=60)

    # 3. email_a should now be locked out with HTTP 429
    locked_out = False
    try:
        limiter.check_login_lockout(email=email_a, ip=ip)
    except HTTPException as exc:
        locked_out = True
        assert exc.status_code == 429
        assert "temporarily locked" in exc.detail

    assert locked_out, "email_a should have been locked out after 5 failed attempts"

    # 4. email_b on the same network is NOT locked out (Account Isolation)
    limiter.check_login_lockout(email=email_b, ip=ip)

    # 5. Correct password entered on email_a resets failure state
    limiter.record_login_success(email=email_a, ip=ip)
    limiter.check_login_lockout(email=email_a, ip=ip)

    # 6. Loopback IP (127.0.0.1) does not suffer IP-level lockout
    loopback_ip = "127.0.0.1"
    for _ in range(20):
        limiter.record_login_failure(email="tester@company.com", ip=loopback_ip, max_failures=5, lockout_seconds=30, window_seconds=60)
    # Another user on localhost is NOT locked out by IP
    limiter.check_login_lockout(email="other@company.com", ip=loopback_ip)


def test_client_ip_extraction():
    """Test accurate client IP resolution from various proxy headers."""
    class FakeRequest:
        def __init__(self, headers=None, client_host="127.0.0.1"):
            self.headers = headers or {}
            self.client = type("Client", (), {"host": client_host})()

    # Cloudflare edge header prioritized
    req_cf = FakeRequest(headers={"CF-Connecting-IP": "198.51.100.22", "X-Forwarded-For": "10.0.0.1"})
    assert get_client_ip(req_cf) == "198.51.100.22"

    # X-Real-IP
    req_real = FakeRequest(headers={"X-Real-IP": "198.51.100.33"})
    assert get_client_ip(req_real) == "198.51.100.33"

    # X-Forwarded-For multi-hop
    req_xff = FakeRequest(headers={"X-Forwarded-For": "198.51.100.44, 10.0.0.2, 127.0.0.1"})
    assert get_client_ip(req_xff) == "198.51.100.44"

    # Direct client fallback
    req_direct = FakeRequest(client_host="192.0.2.1")
    assert get_client_ip(req_direct) == "192.0.2.1"
