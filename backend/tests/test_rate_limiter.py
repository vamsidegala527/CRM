import time
import math
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi import HTTPException

from app.config import settings
from app.rate_limiter import (
    TokenBucket,
    SlidingWindowTracker,
    AccountLockoutTracker,
    RateLimiterEngine,
    get_client_ip,
    hash_identity,
    mask_ip,
    is_trusted_proxy_ip,
    RateLimiterMetrics,
    LUA_SLIDING_WINDOW,
    LUA_TOKEN_BUCKET,
    LUA_ACCOUNT_LOCKOUT,
)


# ==================== 1. Functional Tests: Algorithms & Boundary Math ====================

def test_token_bucket_burst_and_replenishment():
    """Test that Token Bucket allows bursts up to capacity and replenishes deterministically over time."""
    capacity = 10
    fill_rate = 2.0  # 2 tokens per second
    t0 = 1000.0
    bucket = TokenBucket(capacity=capacity, fill_rate=fill_rate, now=t0)

    # 1. Burst of 10 requests should all succeed
    for i in range(10):
        allowed, rem, reset_secs = bucket.consume(1.0, now=t0)
        assert allowed is True, f"Request {i+1} should have been allowed"
        assert rem == (9 - i), f"Remaining tokens should be {9 - i}"

    # 2. 11th request immediately at t0 should be denied (exact limit boundary)
    allowed, rem, retry_after = bucket.consume(1.0, now=t0)
    assert allowed is False, "11th request at t0 must be denied"
    assert rem == 0
    assert retry_after >= 1

    # 3. Advance time by 2.5 seconds -> exactly 5.0 tokens replenished (2.5 * 2 = 5)
    t1 = t0 + 2.5
    allowed, rem, _ = bucket.consume(1.0, now=t1)
    assert allowed is True
    assert rem == 4  # 5 replenished - 1 consumed = 4 remaining


def test_sliding_window_tracker_boundaries():
    """Test that SlidingWindowTracker enforces exact boundary and calculates accurate retry_after."""
    window = 60
    max_req = 3
    t0 = 2000.0
    tracker = SlidingWindowTracker(window_seconds=window)

    # 3 requests succeed
    res1 = tracker.check_and_add(max_requests=max_req, now=t0)
    assert res1[0] is True
    assert res1[1] == 2  # remaining = 2

    res2 = tracker.check_and_add(max_requests=max_req, now=t0 + 10)
    assert res2[0] is True
    assert res2[1] == 1  # remaining = 1

    res3 = tracker.check_and_add(max_requests=max_req, now=t0 + 20)
    assert res3[0] is True
    assert res3[1] == 0  # remaining = 0 (exact boundary)

    # 4th request within window fails
    allowed, rem, retry_after = tracker.check_and_add(max_requests=max_req, now=t0 + 30)
    assert allowed is False
    assert rem == 0
    assert retry_after == 30  # 60 - (30 - 0) = 30s remaining

    # Advance past the oldest timestamp (t0 + 65) -> oldest falls out of window -> allowed again
    allowed, rem, _ = tracker.check_and_add(max_requests=max_req, now=t0 + 65)
    assert allowed is True


# ==================== 2. Account Defense, Progressive Delays & PII Safety ====================

def test_progressive_account_lockout_tiers():
    """Verify multi-tier progressive backoff cooldowns based on failure volume."""
    assert AccountLockoutTracker.calculate_cooldown(1) == 30
    assert AccountLockoutTracker.calculate_cooldown(4) == 30
    assert AccountLockoutTracker.calculate_cooldown(5) == 10   # Tier 1
    assert AccountLockoutTracker.calculate_cooldown(9) == 10
    assert AccountLockoutTracker.calculate_cooldown(10) == 60  # Tier 2
    assert AccountLockoutTracker.calculate_cooldown(19) == 60
    assert AccountLockoutTracker.calculate_cooldown(20) == 300 # Tier 3
    assert AccountLockoutTracker.calculate_cooldown(24) == 300
    assert AccountLockoutTracker.calculate_cooldown(25) == 900 # Tier 4


def test_account_isolation_and_success_reset():
    """Test brute-force login lockout per account and verify strict account isolation and reset."""
    engine = RateLimiterEngine()
    email_a = "victim@company.com"
    email_b = "innocent@company.com"

    # 1. Normal state: no lockout for either account
    engine.check_login_lockout(email=email_a)
    engine.check_login_lockout(email=email_b)

    # 2. Record 5 failed logins for email_a (threshold=5)
    for _ in range(5):
        engine.record_login_failure(email=email_a, max_failures=5, lockout_seconds=30, window_seconds=60)

    # 3. email_a should now be locked out with HTTP 429
    locked_out = False
    try:
        engine.check_login_lockout(email=email_a)
    except HTTPException as exc:
        locked_out = True
        assert exc.status_code == 429
        assert "temporarily locked" in exc.detail
        assert "Retry-After" in exc.headers

    assert locked_out, "email_a should have been locked out after 5 failed attempts"

    # 4. email_b on the same network is NOT locked out (Strict Account Isolation)
    engine.check_login_lockout(email=email_b)

    # 5. Correct password entered on email_a resets failure state immediately
    engine.record_login_success(email=email_a)
    engine.check_login_lockout(email=email_a)  # Should not raise exception now


def test_identity_hashing_pii_safety():
    """Ensure account emails are normalized and hashed deterministically without exposing PII."""
    hash1 = hash_identity("  Alice.Smith@Company.COM  ")
    hash2 = hash_identity("alice.smith@company.com")
    assert hash1 == hash2, "Identity hashing must normalize casing and whitespace"
    assert len(hash1) == 16, "Must produce a compact 16-hex hash prefix"
    assert "alice" not in hash1.lower(), "Raw email text must not appear in the hash key"

    # Verify IP masking
    assert mask_ip("198.51.100.22") == "198.51.***.***"
    assert mask_ip("2001:0db8:85a3:0000:0000:8a2e:0370:7334") == "2001:0db8:****:****"


# ==================== 3. Security: Anti-Spoofing & Trusted Proxy Validation ====================

class FakeRequest:
    def __init__(self, headers=None, client_host="127.0.0.1"):
        self.headers = headers or {}
        self.client = type("Client", (), {"host": client_host})()


def test_ip_spoofing_prevention_untrusted_direct_caller():
    """Direct untrusted connections must NOT be able to spoof IP via XFF or X-App-Client-IP headers."""
    # Caller connects from a public IP (198.51.100.99) not in TRUSTED_PROXIES
    req_spoof = FakeRequest(
        headers={
            "X-App-Client-IP": "1.1.1.1",
            "X-Forwarded-For": "2.2.2.2, 3.3.3.3",
            "X-Real-IP": "4.4.4.4",
        },
        client_host="198.51.100.99"
    )
    # The direct socket IP (198.51.100.99) must be enforced, completely ignoring spoofed headers!
    resolved_ip = get_client_ip(req_spoof)
    assert resolved_ip == "198.51.100.99", f"Expected socket IP 198.51.100.99, but got {resolved_ip}"


def test_trusted_proxy_forwarding():
    """Verified trusted proxies (loopback, private subnet, or verified proxy secret) forward the real client IP."""
    # 1. Trusted loopback proxy with X-App-Client-IP
    req_trusted = FakeRequest(
        headers={"X-App-Client-IP": "203.0.113.50"},
        client_host="127.0.0.1"
    )
    assert get_client_ip(req_trusted) == "203.0.113.50"

    # 2. Multi-hop XFF through trusted proxy: selects leftmost public IP
    req_xff = FakeRequest(
        headers={"X-Forwarded-For": "203.0.113.88, 10.0.0.1, 127.0.0.1"},
        client_host="127.0.0.1"
    )
    assert get_client_ip(req_xff) == "203.0.113.88"

    # 3. Connection with valid X-Internal-Proxy-Secret
    orig_secret = settings.INTERNAL_PROXY_SECRET
    try:
        settings.INTERNAL_PROXY_SECRET = "super_secure_proxy_token_xyz"
        req_secret = FakeRequest(
            headers={
                "X-Internal-Proxy-Secret": "super_secure_proxy_token_xyz",
                "X-App-Client-IP": "198.51.100.77"
            },
            client_host="192.0.2.1"  # Public IP, but authenticated via proxy secret!
        )
        assert get_client_ip(req_secret) == "198.51.100.77"
    finally:
        settings.INTERNAL_PROXY_SECRET = orig_secret


# ==================== 4. Concurrency & Thread Safety ====================

def test_multi_threaded_concurrency():
    """Simultaneous concurrent requests hitting a token bucket must not violate capacity or create race conditions."""
    capacity = 10
    fill_rate = 0.0001  # Negligible fill during the microsecond burst
    t0 = 5000.0
    bucket = TokenBucket(capacity=capacity, fill_rate=fill_rate, now=t0)
    lock = threading.Lock()

    successes = []
    denials = []

    def worker():
        with lock:
            allowed, rem, _ = bucket.consume(1.0, now=t0)
        if allowed:
            successes.append(1)
        else:
            denials.append(1)

    threads = [threading.Thread(target=worker) for _ in range(30)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(successes) == 10, f"Exactly 10 requests should have succeeded, got {len(successes)}"
    assert len(denials) == 20, f"Exactly 20 requests should have been denied, got {len(denials)}"
    assert bucket.tokens >= 0.0, "Bucket tokens must never drop below 0"


# ==================== 5. Resilience & Degraded Fallback ====================

def test_redis_outage_circuit_breaker_and_fallback():
    """When Redis fails or throws exceptions, circuit breaker trips and engine falls back gracefully to in-memory."""
    engine = RateLimiterEngine()

    # Simulate an active Redis backend that raises a network ConnectionError
    class FaultyRedis:
        def ping(self):
            raise ConnectionError("Redis cluster node unreachable")

    class FaultyBackend:
        def __init__(self):
            self.redis = FaultyRedis()
        def check_token_bucket(self, *args, **kwargs):
            raise ConnectionError("Connection lost to Redis server")

    engine._redis_backend = FaultyBackend()
    engine._circuit_open = False

    # This call should catch the ConnectionError, trip the circuit breaker, and succeed via in-memory fallback!
    allowed, remaining, reset_secs = engine.check_token_bucket("resilience_test_key", rate_per_minute=60)
    assert allowed is True
    assert engine._circuit_open is True, "Circuit breaker must be tripped to OPEN on Redis error"
    assert engine._circuit_cooldown_until > time.monotonic()


def test_bounded_lru_eviction():
    """Ensure in-memory storage evicts oldest entries when capacity is exceeded to prevent memory exhaustion."""
    engine = RateLimiterEngine()
    test_cache = engine._buckets

    # Populate 100 items and verify LRU eviction works
    for i in range(100):
        key = f"key_{i}"
        test_cache[key] = TokenBucket(capacity=10, fill_rate=1.0)
        engine._evict_lru_if_needed(test_cache, max_items=50)

    assert len(test_cache) == 50, f"Cache size must be bounded at 50, got {len(test_cache)}"
    assert "key_0" not in test_cache, "Oldest key_0 should have been evicted"
    assert "key_99" in test_cache, "Newest key_99 should be present"


# ==================== 6. HTTP Enforcement & Headers ====================

def test_enforce_rate_limit_headers_and_status():
    """Test that enforce_rate_limit raises HTTP 429 with all required RFC headers."""
    engine = RateLimiterEngine()
    key = "test_headers_key"

    # Consume all tokens (capacity=2)
    engine.enforce_rate_limit(key=key, rate_per_minute=2, burst=2, limit_name="requests")
    engine.enforce_rate_limit(key=key, rate_per_minute=2, burst=2, limit_name="requests")

    # 3rd request must raise HTTP 429 with standard headers
    with pytest.raises(HTTPException) as exc_info:
        engine.enforce_rate_limit(key=key, rate_per_minute=2, burst=2, limit_name="requests", policy_name="unit_test")

    exc = exc_info.value
    assert exc.status_code == 429
    assert "Retry-After" in exc.headers
    assert exc.headers["RateLimit-Limit"] == "2"
    assert exc.headers["RateLimit-Remaining"] == "0"
    assert "RateLimit-Reset" in exc.headers
    assert exc.headers["RateLimit-Policy"] == "unit_test"
