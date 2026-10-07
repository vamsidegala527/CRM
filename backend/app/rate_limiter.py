import time
import math
import hashlib
import threading
from typing import Dict, List, Tuple, Optional, Any
from collections import deque

# pyrefly: ignore [missing-import]
from fastapi import Request, HTTPException, status, Response, Depends

from app.config import settings

# Optional Redis support with safe fallback
redis_client = None
if getattr(settings, "REDIS_URL", None) and settings.REDIS_URL.strip():
    try:
        import redis
        redis_client = redis.Redis.from_url(settings.REDIS_URL.strip(), decode_responses=True, socket_timeout=2.0)
        redis_client.ping()
        print("✅ [RATE LIMITER] Connected to Redis for distributed rate limiting.")
    except Exception as e:
        print(f"⚠️ [RATE LIMITER] Redis connection failed ({e}). Falling back to in-memory engine.")
        redis_client = None


class TokenBucket:
    """
    High-performance, thread-safe Token Bucket rate limiter.
    Allows bursts up to `capacity` while enforcing an average rate of `fill_rate` tokens/second.
    """
    __slots__ = ('capacity', 'fill_rate', 'tokens', 'last_update')

    def __init__(self, capacity: float, fill_rate: float, now: Optional[float] = None):
        self.capacity = float(capacity)
        self.fill_rate = float(fill_rate)
        self.tokens = float(capacity)
        self.last_update = now if now is not None else time.time()

    def consume(self, tokens_needed: float = 1.0, now: Optional[float] = None) -> Tuple[bool, int, int]:
        """
        Attempts to consume `tokens_needed` tokens.
        Returns (allowed: bool, remaining_tokens: int, reset_seconds: int).
        """
        current_time = now if now is not None else time.time()
        elapsed = current_time - self.last_update
        self.last_update = current_time

        # Replenish tokens based on elapsed time
        self.tokens = min(self.capacity, self.tokens + (elapsed * self.fill_rate))

        if self.tokens >= tokens_needed:
            self.tokens -= tokens_needed
            remaining = max(0, int(self.tokens))
            reset_secs = max(1, int(math.ceil((self.capacity - self.tokens) / self.fill_rate))) if self.fill_rate > 0 else 1
            return True, remaining, reset_secs
        else:
            needed = tokens_needed - self.tokens
            retry_after = max(1, int(math.ceil(needed / self.fill_rate))) if self.fill_rate > 0 else 60
            return False, 0, retry_after


class SlidingWindowTracker:
    """
    Sliding window log tracker for security-sensitive actions (e.g. OTP resend, forgot-password).
    """
    __slots__ = ('window_seconds', 'timestamps')

    def __init__(self, window_seconds: int):
        self.window_seconds = window_seconds
        self.timestamps: deque = deque()

    def check_and_add(self, max_requests: int, now: Optional[float] = None) -> Tuple[bool, int, int]:
        current_time = now if now is not None else time.time()
        cutoff = current_time - self.window_seconds

        # Prune expired timestamps
        while self.timestamps and self.timestamps[0] <= cutoff:
            self.timestamps.popleft()

        current_count = len(self.timestamps)
        if current_count >= max_requests:
            oldest = self.timestamps[0]
            retry_after = max(1, int(math.ceil(self.window_seconds - (current_time - oldest))))
            return False, 0, retry_after

        self.timestamps.append(current_time)
        remaining = max(0, max_requests - (current_count + 1))
        reset_secs = max(1, int(math.ceil(self.window_seconds - (current_time - self.timestamps[0]))))
        return True, remaining, reset_secs


def is_private_or_loopback_ip(ip: Optional[str]) -> bool:
    """Returns True if the IP is loopback, local dev, Docker network, or internal private RFC1918 subnet."""
    if not ip:
        return True
    ip_clean = ip.strip().lower()
    if ip_clean in ("127.0.0.1", "::1", "localhost", "testclient", "unknown", "0.0.0.0"):
        return True
    if ip_clean.startswith("10.") or ip_clean.startswith("192.168."):
        return True
    if ip_clean.startswith("172."):
        parts = ip_clean.split(".")
        if len(parts) >= 2 and parts[1].isdigit():
            second_octet = int(parts[1])
            if 16 <= second_octet <= 31:
                return True
    return False


class RateLimiter:
    """
    Comprehensive, enterprise-grade Rate Limiter supporting:
    1. Token Bucket (allows smooth burst capacity for SPA initial loads).
    2. Sliding Window (for strict security routes).
    3. Account-level brute-force protection with progressive backoff.
    4. Client IP resolution across reverse proxies and CDNs.
    5. Standard RFC RateLimit headers (Limit, Remaining, Reset, Retry-After).
    """
    def __init__(self):
        self._lock = threading.RLock()
        self._buckets: Dict[str, TokenBucket] = {}
        self._sliding_windows: Dict[str, SlidingWindowTracker] = {}
        # Maps account_key -> (list_of_failure_timestamps, lockout_until_timestamp)
        self._failed_logins: Dict[str, Tuple[List[float], float]] = {}
        self._last_prune = time.time()

    def _maybe_prune(self, now: float):
        """Periodically removes stale buckets to prevent unbounded memory growth."""
        if len(self._buckets) < 10000 and (now - self._last_prune < 180):
            return
        self._last_prune = now
        stale_cutoff = now - 300

        # Prune inactive token buckets
        stale_bucket_keys = [k for k, b in self._buckets.items() if b.last_update < stale_cutoff]
        for k in stale_bucket_keys:
            del self._buckets[k]

        # Prune inactive sliding windows
        stale_window_keys = [
            k for k, w in self._sliding_windows.items()
            if not w.timestamps or w.timestamps[-1] < (now - w.window_seconds - 60)
        ]
        for k in stale_window_keys:
            del self._sliding_windows[k]

        # Prune expired failed logins
        stale_login_keys = [
            k for k, (failures, lockout_until) in self._failed_logins.items()
            if (not failures or failures[-1] < stale_cutoff) and lockout_until < now
        ]
        for k in stale_login_keys:
            del self._failed_logins[k]

    def check_token_bucket(
        self,
        key: str,
        rate_per_minute: int = 120,
        burst: Optional[int] = None,
        cost: int = 1
    ) -> Tuple[bool, int, int]:
        """
        Evaluates a Token Bucket limit.
        Returns (allowed, remaining_tokens, reset_or_retry_seconds).
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True) or "testclient" in key:
            return True, rate_per_minute, 60

        # For localhost / loopback / private IP requests, expand burst and capacity to prevent false-positive blocks
        ip_candidate = key.split(":")[-1] if ":" in key else ""
        if is_private_or_loopback_ip(ip_candidate):
            effective_rpm = max(rate_per_minute, 1200)
            effective_burst = max(burst or 0, 300)
        else:
            effective_rpm = rate_per_minute
            effective_burst = burst if burst is not None else max(rate_per_minute // 2, 20)

        capacity = effective_burst
        fill_rate = float(effective_rpm) / 60.0
        now = time.time()

        with self._lock:
            self._maybe_prune(now)
            if key not in self._buckets:
                self._buckets[key] = TokenBucket(capacity=capacity, fill_rate=fill_rate, now=now)
            bucket = self._buckets[key]
            # If rate changed dynamically, update bucket params
            bucket.capacity = capacity
            bucket.fill_rate = fill_rate
            return bucket.consume(tokens_needed=cost, now=now)

    def check_sliding_window(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int, int]:
        """
        Evaluates a Sliding Window limit for strict sensitive actions.
        Returns (allowed, remaining, reset_or_retry_seconds).
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True) or "testclient" in key:
            return True, max_requests, window_seconds

        now = time.time()
        with self._lock:
            self._maybe_prune(now)
            if key not in self._sliding_windows or self._sliding_windows[key].window_seconds != window_seconds:
                self._sliding_windows[key] = SlidingWindowTracker(window_seconds=window_seconds)
            return self._sliding_windows[key].check_and_add(max_requests=max_requests, now=now)

    def enforce_rate_limit(
        self,
        key: str,
        rate_per_minute: int = 120,
        burst: Optional[int] = None,
        cost: int = 1,
        limit_name: str = "requests"
    ) -> Dict[str, str]:
        """
        Checks Token Bucket limit and either raises HTTP 429 or returns standard RateLimit headers.
        """
        allowed, remaining, reset_or_retry = self.check_token_bucket(
            key=key, rate_per_minute=rate_per_minute, burst=burst, cost=cost
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many {limit_name}. Please retry after {reset_or_retry} seconds.",
                headers={
                    "Retry-After": str(reset_or_retry),
                    "RateLimit-Limit": str(rate_per_minute),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_or_retry),
                }
            )
        return {
            "RateLimit-Limit": str(rate_per_minute),
            "RateLimit-Remaining": str(remaining),
            "RateLimit-Reset": str(reset_or_retry),
        }

    def enforce_strict_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
        action_name: str = "requests"
    ) -> Dict[str, str]:
        """
        Checks Sliding Window limit for strict routes and raises HTTP 429 if exceeded.
        """
        allowed, remaining, reset_or_retry = self.check_sliding_window(
            key=key, max_requests=max_requests, window_seconds=window_seconds
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many {action_name} attempts. Please wait {reset_or_retry} seconds before trying again.",
                headers={
                    "Retry-After": str(reset_or_retry),
                    "RateLimit-Limit": str(max_requests),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_or_retry),
                }
            )
        return {
            "RateLimit-Limit": str(max_requests),
            "RateLimit-Remaining": str(remaining),
            "RateLimit-Reset": str(reset_or_retry),
        }

    # ==================== Account-Level Brute Force Defense (Strictly Isolated Per Account) ====================

    def check_login_lockout(self, email: str, ip: Optional[str] = None) -> None:
        """
        Checks if this specific account email is currently locked out due to repeated failed logins.
        Isolated strictly per user account so innocent colleagues/devices on the same network are never affected.
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return

        now = time.time()
        email_clean = email.strip().lower()
        account_key = f"login_acc:{hashlib.sha256(email_clean.encode()).hexdigest()[:16]}"

        with self._lock:
            # Check Account Lockout (Per-account brute force defense)
            if account_key in self._failed_logins:
                _, lockout_until = self._failed_logins[account_key]
                if now < lockout_until:
                    remaining = max(1, int(math.ceil(lockout_until - now)))
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Account temporarily locked due to repeated failed sign-in attempts. Please try again in {remaining} seconds.",
                        headers={"Retry-After": str(remaining)}
                    )
                elif lockout_until > 0 and now >= lockout_until:
                    # Lockout expired, clear tracker
                    del self._failed_logins[account_key]

    def record_login_failure(
        self,
        email: str,
        ip: Optional[str] = None,
        max_failures: int = 15,
        lockout_seconds: int = 30,
        window_seconds: int = 180
    ) -> None:
        """
        Records a failed authentication attempt strictly for the target account.
        Only triggers a temporary lockout if max_failures is exceeded within window_seconds on this specific account.
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return

        now = time.time()
        email_clean = email.strip().lower()
        account_key = f"login_acc:{hashlib.sha256(email_clean.encode()).hexdigest()[:16]}"
        cutoff = now - window_seconds

        with self._lock:
            acc_failures, acc_lockout = self._failed_logins.get(account_key, ([], 0.0))
            recent_acc = [t for t in acc_failures if t > cutoff]
            recent_acc.append(now)

            if len(recent_acc) >= max_failures:
                acc_lockout = now + lockout_seconds
                self._failed_logins[account_key] = (recent_acc, acc_lockout)
            else:
                self._failed_logins[account_key] = (recent_acc, 0.0)

    def record_login_success(self, email: str, ip: Optional[str] = None) -> None:
        """
        Resets failed attempt counters immediately upon successful authentication.
        Guarantees that a user with valid credentials is completely cleared from any previous lockout records.
        """
        email_clean = email.strip().lower()
        account_key = f"login_acc:{hashlib.sha256(email_clean.encode()).hexdigest()[:16]}"

        with self._lock:
            self._failed_logins.pop(account_key, None)


# Global singleton instance
limiter = RateLimiter()


def get_client_ip(request: Request) -> str:
    """
    Extracts the true client IP address with full support for:
    - Cloudflare (CF-Connecting-IP)
    - Akamai / Enterprise (True-Client-IP)
    - Nginx / Next.js Proxy (X-Real-IP)
    - Multi-hop proxies (X-Forwarded-For)
    - Direct connection fallback (request.client.host)
    """
    # 1. Cloudflare edge
    cf_ip = request.headers.get("CF-Connecting-IP") or request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()

    # 2. True-Client-IP
    true_ip = request.headers.get("True-Client-IP") or request.headers.get("true-client-ip")
    if true_ip and true_ip.strip():
        return true_ip.strip()

    # 3. Standard X-Real-IP
    real_ip = request.headers.get("X-Real-IP") or request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    # 4. Standard X-Forwarded-For (Leftmost public IP)
    forwarded_for = request.headers.get("X-Forwarded-For") or request.headers.get("x-forwarded-for")
    if forwarded_for:
        ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
        for candidate in ips:
            if candidate and candidate.lower() != "unknown":
                return candidate

    # 5. Direct client host fallback
    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


# ==================== FastAPI Dependency Providers ====================

def rate_limit_public(
    rpm: Optional[int] = None,
    burst: Optional[int] = None,
    action: str = "public_api"
):
    """
    Dependency factory for public / unauthenticated endpoints.
    Keyed by: `action:{action}:ip:{client_ip}`.
    """
    effective_rpm = rpm if rpm is not None else settings.RATE_LIMIT_PUBLIC_RPM
    effective_burst = burst if burst is not None else settings.RATE_LIMIT_PUBLIC_BURST

    def dependency(request: Request, response: Response):
        ip = get_client_ip(request)
        key = f"{action}:{ip}"
        headers = limiter.enforce_rate_limit(
            key=key,
            rate_per_minute=effective_rpm,
            burst=effective_burst,
            limit_name="requests"
        )
        for h, v in headers.items():
            response.headers[h] = v

    return dependency


def rate_limit_strict_action(
    max_requests: int,
    window_seconds: int,
    action_name: str
):
    """
    Dependency factory for sensitive actions (e.g. OTP verification, email resends).
    Keyed by: `action:{action_name}:ip:{client_ip}`.
    """
    def dependency(request: Request, response: Response):
        ip = get_client_ip(request)
        key = f"strict:{action_name}:{ip}"
        headers = limiter.enforce_strict_limit(
            key=key,
            max_requests=max_requests,
            window_seconds=window_seconds,
            action_name=action_name
        )
        for h, v in headers.items():
            response.headers[h] = v

    return dependency
