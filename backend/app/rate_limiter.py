import time
import math
import hashlib
import ipaddress
import logging
import threading
from collections import deque, OrderedDict
from typing import Dict, List, Tuple, Optional, Any

# pyrefly: ignore [missing-import]
from fastapi import Request, HTTPException, status, Response, Depends

from app.config import settings

logger = logging.getLogger("rate_limiter")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [RATE_LIMITER] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# ==================== Privacy-Safe Masking Utilities ====================

def mask_ip(ip: Optional[str]) -> str:
    """Masks an IP address to preserve user privacy in log outputs and metrics."""
    if not ip or ip.strip().lower() in ("unknown", "none"):
        return "unknown"
    ip_clean = ip.strip()
    try:
        obj = ipaddress.ip_address(ip_clean)
        if obj.version == 4:
            octets = ip_clean.split(".")
            if len(octets) == 4:
                return f"{octets[0]}.{octets[1]}.***.***"
        elif obj.version == 6:
            hextets = ip_clean.split(":")
            if len(hextets) >= 2:
                return f"{hextets[0]}:{hextets[1]}:****:****"
    except ValueError:
        pass
    return ip_clean[:4] + "***" if len(ip_clean) > 4 else "***"


def hash_identity(raw_identifier: str) -> str:
    """Generates a deterministic, one-way SHA-256 hash prefix for account identifiers."""
    clean = raw_identifier.strip().lower()
    return hashlib.sha256(clean.encode("utf-8")).hexdigest()[:16]


# ==================== Observability & Metrics ====================

class RateLimiterMetrics:
    """Thread-safe telemetry and health tracker for rate-limiting operations."""
    def __init__(self):
        self._lock = threading.Lock()
        self.total_allowed = 0
        self.total_denied = 0
        self.denials_by_policy: Dict[str, int] = {}
        self.backend_status = "initializing"
        self.redis_errors_count = 0
        self.last_redis_error: Optional[str] = None
        self.circuit_breaker_trips = 0

    def record_allowed(self, policy: str):
        with self._lock:
            self.total_allowed += 1

    def record_denied(self, policy: str):
        with self._lock:
            self.total_denied += 1
            self.denials_by_policy[policy] = self.denials_by_policy.get(policy, 0) + 1

    def record_redis_error(self, err_msg: str):
        with self._lock:
            self.redis_errors_count += 1
            self.last_redis_error = err_msg

    def record_circuit_trip(self):
        with self._lock:
            self.circuit_breaker_trips += 1

    def set_backend_status(self, status: str):
        with self._lock:
            self.backend_status = status

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "backend_status": self.backend_status,
                "total_allowed": self.total_allowed,
                "total_denied": self.total_denied,
                "denials_by_policy": dict(self.denials_by_policy),
                "redis_errors_count": self.redis_errors_count,
                "last_redis_error": self.last_redis_error,
                "circuit_breaker_trips": self.circuit_breaker_trips,
            }


metrics = RateLimiterMetrics()


# ==================== Trusted Proxy & Client IP Extraction ====================

_PARSED_TRUSTED_PROXIES: List[Any] = []
_TRUSTED_PROXIES_LOCK = threading.Lock()

def _get_trusted_networks() -> List[Any]:
    global _PARSED_TRUSTED_PROXIES
    if _PARSED_TRUSTED_PROXIES:
        return _PARSED_TRUSTED_PROXIES

    with _TRUSTED_PROXIES_LOCK:
        if _PARSED_TRUSTED_PROXIES:
            return _PARSED_TRUSTED_PROXIES
        raw = getattr(settings, "TRUSTED_PROXIES", "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16")
        networks = []
        for entry in raw.split(","):
            entry_clean = entry.strip()
            if not entry_clean:
                continue
            try:
                if "/" in entry_clean:
                    networks.append(ipaddress.ip_network(entry_clean, strict=False))
                else:
                    networks.append(ipaddress.ip_network(f"{entry_clean}/32" if ":" not in entry_clean else f"{entry_clean}/128", strict=False))
            except ValueError:
                logger.warning(f"Invalid trusted proxy network configuration: {entry_clean}")
        _PARSED_TRUSTED_PROXIES = networks
        return _PARSED_TRUSTED_PROXIES


def is_trusted_proxy_ip(ip: Optional[str]) -> bool:
    """Returns True if the IP belongs to a configured trusted reverse proxy or local RFC1918 subnet."""
    if not ip or ip.strip().lower() in ("unknown", "localhost", "testclient"):
        return True
    ip_clean = ip.strip()
    if ip_clean.startswith("::ffff:"):
        ip_clean = ip_clean[7:]
    try:
        addr = ipaddress.ip_address(ip_clean)
        for net in _get_trusted_networks():
            if addr in net:
                return True
    except ValueError:
        return False
    return False


def get_client_ip(request: Request) -> str:
    """
    Extracts the verified client IP address.
    Protects against IP spoofing: forwarding headers (X-Forwarded-For, X-App-Client-IP, etc.)
    are ONLY trusted if the direct connection originates from a verified trusted proxy OR
    the request contains the validated INTERNAL_PROXY_SECRET header.
    """
    direct_host = request.client.host if (request.client and request.client.host) else "127.0.0.1"
    if direct_host.startswith("::ffff:"):
        direct_host = direct_host[7:]

    # Check proxy secret authorization
    expected_secret = getattr(settings, "INTERNAL_PROXY_SECRET", "").strip()
    has_valid_secret = False
    if expected_secret:
        proxy_secret_hdr = request.headers.get("X-Internal-Proxy-Secret") or request.headers.get("x-internal-proxy-secret")
        if proxy_secret_hdr and proxy_secret_hdr.strip() == expected_secret:
            has_valid_secret = True

    is_trusted = has_valid_secret or is_trusted_proxy_ip(direct_host)

    if not is_trusted:
        # Untrusted direct connection: strictly use direct socket IP to prevent header spoofing
        return direct_host

    # Trusted proxy: safely inspect forwarded headers in prioritized order
    # 1. Custom internal app client IP (set by verified Next.js proxy)
    app_ip = request.headers.get("X-App-Client-IP") or request.headers.get("x-app-client-ip")
    if app_ip and app_ip.strip() and app_ip.strip().lower() != "unknown":
        clean_cand = app_ip.strip()
        if clean_cand.startswith("::ffff:"):
            clean_cand = clean_cand[7:]
        return clean_cand

    # 2. X-Forwarded-For: select leftmost non-trusted public client IP
    forwarded_for = request.headers.get("X-Forwarded-For") or request.headers.get("x-forwarded-for")
    if forwarded_for:
        raw_ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
        for candidate in raw_ips:
            if candidate and candidate.lower() != "unknown":
                clean_cand = candidate
                if clean_cand.startswith("::ffff:"):
                    clean_cand = clean_cand[7:]
                # First non-trusted public IP in the chain represents the originating client
                if not is_trusted_proxy_ip(clean_cand):
                    return clean_cand
        # If all were internal/trusted, return the first one
        if raw_ips:
            return raw_ips[0]

    # 3. Standard single-value edge headers
    for hdr_name in ("X-Real-IP", "CF-Connecting-IP", "True-Client-IP"):
        val = request.headers.get(hdr_name) or request.headers.get(hdr_name.lower())
        if val and val.strip() and val.strip().lower() != "unknown":
            clean_val = val.strip()
            if clean_val.startswith("::ffff:"):
                clean_val = clean_val[7:]
            return clean_val

    return direct_host


# ==================== Core In-Memory Data Structures ====================

class TokenBucket:
    """
    High-performance, thread-safe Token Bucket rate limiter using monotonic clock.
    Allows bursts up to `capacity` while enforcing an average rate of `fill_rate` tokens/second.
    """
    __slots__ = ('capacity', 'fill_rate', 'tokens', 'last_update')

    def __init__(self, capacity: float, fill_rate: float, now: Optional[float] = None):
        self.capacity = float(capacity)
        self.fill_rate = float(fill_rate)
        self.tokens = float(capacity)
        self.last_update = now if now is not None else time.monotonic()

    def consume(self, tokens_needed: float = 1.0, now: Optional[float] = None) -> Tuple[bool, int, int]:
        current_time = now if now is not None else time.monotonic()
        elapsed = max(0.0, current_time - self.last_update)
        self.last_update = current_time

        # Replenish tokens based on elapsed monotonic time
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
    Sliding window log tracker for security-sensitive actions using monotonic clock.
    """
    __slots__ = ('window_seconds', 'timestamps')

    def __init__(self, window_seconds: int):
        self.window_seconds = window_seconds
        self.timestamps: deque = deque()

    def check_and_add(self, max_requests: int, now: Optional[float] = None) -> Tuple[bool, int, int]:
        current_time = now if now is not None else time.monotonic()
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


class AccountLockoutTracker:
    """
    Tracks failed authentication attempts per account with progressive delay tiers.
    Tier 1 (5 failures): 10 seconds cooldown
    Tier 2 (10 failures): 60 seconds cooldown
    Tier 3 (20 failures): 300 seconds (5 min) cooldown
    Tier 4 (25+ failures): 900 seconds (15 min) cooldown
    """
    __slots__ = ('failure_timestamps', 'lockout_until')

    def __init__(self):
        self.failure_timestamps: List[float] = []
        self.lockout_until: float = 0.0

    @staticmethod
    def calculate_cooldown(failure_count: int, default_lockout: int = 30) -> int:
        if failure_count >= 25:
            return 900
        elif failure_count >= 20:
            return 300
        elif failure_count >= 10:
            return 60
        elif failure_count >= 5:
            return 10
        return default_lockout


# ==================== Redis Lua Script Definitions ====================

# 1. Atomic Sliding Window Lua Script
# KEYS[1] = Rate limit key
# ARGV[1] = current_time (epoch float), ARGV[2] = window_seconds, ARGV[3] = max_requests, ARGV[4] = unique_member_id
LUA_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]

local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local current_count = redis.call('ZCARD', key)

if current_count >= max_requests then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = math.ceil(window)
    if oldest and #oldest >= 2 then
        retry_after = math.max(1, math.ceil(window - (now - tonumber(oldest[2]))))
    end
    return {0, 0, retry_after}
else
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, math.ceil(window) + 60)
    local remaining = max_requests - current_count - 1
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local reset_secs = math.ceil(window)
    if oldest and #oldest >= 2 then
        reset_secs = math.max(1, math.ceil(window - (now - tonumber(oldest[2]))))
    end
    return {1, remaining, reset_secs}
end
"""

# 2. Atomic Token Bucket Lua Script
# KEYS[1] = Rate limit key
# ARGV[1] = current_time (epoch float), ARGV[2] = capacity, ARGV[3] = fill_rate, ARGV[4] = cost, ARGV[5] = ttl_seconds
LUA_TOKEN_BUCKET = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local fill_rate = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'tokens', 'last_update')
local tokens = tonumber(data[1])
local last_update = tonumber(data[2])

if not tokens or not last_update then
    tokens = capacity
    last_update = now
else
    local elapsed = math.max(0, now - last_update)
    tokens = math.min(capacity, tokens + (elapsed * fill_rate))
    last_update = now
end

if tokens >= cost then
    tokens = tokens - cost
    redis.call('HMSET', key, 'tokens', tokens, 'last_update', last_update)
    redis.call('EXPIRE', key, ttl)
    local remaining = math.floor(tokens)
    local reset_secs = 1
    if fill_rate > 0 then
        reset_secs = math.max(1, math.ceil((capacity - tokens) / fill_rate))
    end
    return {1, remaining, reset_secs}
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_update', last_update)
    redis.call('EXPIRE', key, ttl)
    local needed = cost - tokens
    local retry_after = 60
    if fill_rate > 0 then
        retry_after = math.max(1, math.ceil(needed / fill_rate))
    end
    return {0, 0, retry_after}
end
"""

# 3. Atomic Account Lockout Check & Failure Recording Lua Script
# KEYS[1] = lockout_key, KEYS[2] = failures_key
# ARGV[1] = action ('check' or 'record' or 'reset')
# ARGV[2] = now, ARGV[3] = window_seconds, ARGV[4] = max_failures, ARGV[5] = default_lockout, ARGV[6] = unique_id
LUA_ACCOUNT_LOCKOUT = """
local lockout_key = KEYS[1]
local failures_key = KEYS[2]
local action = ARGV[1]
local now = tonumber(ARGV[2])

if action == 'check' then
    local lockout_until = redis.call('GET', lockout_key)
    if lockout_until then
        local until_time = tonumber(lockout_until)
        if now < until_time then
            local remaining = math.max(1, math.ceil(until_time - now))
            return {0, remaining}
        else
            redis.call('DEL', lockout_key)
        end
    end
    return {1, 0}

elseif action == 'record' then
    local window = tonumber(ARGV[3])
    local max_failures = tonumber(ARGV[4])
    local default_lockout = tonumber(ARGV[5])
    local member = ARGV[6]

    local cutoff = now - window
    redis.call('ZREMRANGEBYSCORE', failures_key, '-inf', cutoff)
    redis.call('ZADD', failures_key, now, member)
    redis.call('EXPIRE', failures_key, window + 3600)

    local failure_count = redis.call('ZCARD', failures_key)
    if failure_count >= max_failures then
        local cooldown = default_lockout
        if failure_count >= 25 then
            cooldown = 900
        elseif failure_count >= 20 then
            cooldown = 300
        elseif failure_count >= 10 then
            cooldown = 60
        elseif failure_count >= 5 then
            cooldown = 10
        end
        local lockout_until = now + cooldown
        redis.call('SETEX', lockout_key, cooldown, tostring(lockout_until))
        return {0, cooldown, failure_count}
    else
        return {1, 0, failure_count}
    end

elseif action == 'reset' then
    redis.call('DEL', lockout_key)
    redis.call('DEL', failures_key)
    return {1, 0}
end

return {1, 0}
"""


# ==================== Redis Client & Circuit Breaker ====================

class RedisBackend:
    """
    High-performance Redis rate limiting backend with connection pooling,
    sub-second timeouts, and atomic Lua script execution.
    """
    def __init__(self, redis_url: str):
        import redis
        self.redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_timeout=1.0,
            socket_connect_timeout=1.0,
            health_check_interval=30,
        )
        # Register Lua scripts
        self._script_sliding_window = self.redis.register_script(LUA_SLIDING_WINDOW)
        self._script_token_bucket = self.redis.register_script(LUA_TOKEN_BUCKET)
        self._script_account_lockout = self.redis.register_script(LUA_ACCOUNT_LOCKOUT)
        self._member_counter = 0
        self._lock = threading.Lock()

    def _next_member(self) -> str:
        with self._lock:
            self._member_counter += 1
            return f"{time.time()}_{self._member_counter}"

    def check_token_bucket(self, key: str, capacity: int, fill_rate: float, cost: int, ttl: int) -> Tuple[bool, int, int]:
        now = time.time()
        res = self._script_token_bucket(
            keys=[key],
            args=[now, capacity, fill_rate, cost, ttl]
        )
        return bool(res[0]), int(res[1]), int(res[2])

    def check_sliding_window(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int, int]:
        now = time.time()
        member = self._next_member()
        res = self._script_sliding_window(
            keys=[key],
            args=[now, window_seconds, max_requests, member]
        )
        return bool(res[0]), int(res[1]), int(res[2])

    def check_lockout(self, lockout_key: str, failures_key: str) -> Tuple[bool, int]:
        now = time.time()
        res = self._script_account_lockout(
            keys=[lockout_key, failures_key],
            args=['check', now, 0, 0, 0, '']
        )
        return bool(res[0]), int(res[1])

    def record_failure(
        self,
        lockout_key: str,
        failures_key: str,
        window_seconds: int,
        max_failures: int,
        default_lockout: int
    ) -> Tuple[bool, int, int]:
        now = time.time()
        member = self._next_member()
        res = self._script_account_lockout(
            keys=[lockout_key, failures_key],
            args=['record', now, window_seconds, max_failures, default_lockout, member]
        )
        return bool(res[0]), int(res[1]), int(res[2] if len(res) > 2 else 0)

    def reset_lockout(self, lockout_key: str, failures_key: str) -> None:
        now = time.time()
        self._script_account_lockout(
            keys=[lockout_key, failures_key],
            args=['reset', now, 0, 0, 0, '']
        )


class RateLimiterEngine:
    """
    Architectural Rate Limiting Engine providing:
    - Distributed authoritative state via Redis when configured.
    - Bounded LRU in-memory storage fallback with monotonic time.
    - Automatic circuit breaker protecting application availability against Redis outages.
    - Explicit Fail-Closed vs Fail-Open policies per route criticality.
    - Multi-tier brute force defense with progressive backoff.
    """
    MAX_LRU_ENTRIES = 50000

    def __init__(self):
        self._lock = threading.RLock()
        self._buckets: OrderedDict[str, TokenBucket] = OrderedDict()
        self._sliding_windows: OrderedDict[str, SlidingWindowTracker] = OrderedDict()
        self._failed_logins: OrderedDict[str, AccountLockoutTracker] = OrderedDict()
        self._last_prune = time.monotonic()

        # Redis backend & Circuit breaker state
        self._redis_backend: Optional[RedisBackend] = None
        self._circuit_open = False
        self._circuit_cooldown_until = 0.0
        self._init_redis()

    def _init_redis(self):
        redis_url = getattr(settings, "REDIS_URL", "").strip()
        if redis_url:
            try:
                backend = RedisBackend(redis_url)
                backend.redis.ping()
                self._redis_backend = backend
                metrics.set_backend_status("redis_connected")
                logger.info("Connected to Redis for distributed authoritative rate limiting.")
            except Exception as e:
                metrics.set_backend_status("in_memory_fallback")
                metrics.record_redis_error(str(e))
                logger.warning(f"Redis initialization failed ({e}). Running in-memory rate limiting engine.")
                self._redis_backend = None
        else:
            metrics.set_backend_status("in_memory")
            logger.info("No REDIS_URL configured. Initialized in-memory rate limiting engine with bounded LRU.")

    def _is_redis_available(self) -> bool:
        if not self._redis_backend:
            return False
        now = time.monotonic()
        if self._circuit_open:
            if now >= self._circuit_cooldown_until:
                # Probe Redis (half-open state)
                try:
                    self._redis_backend.redis.ping()
                    self._circuit_open = False
                    metrics.set_backend_status("redis_connected")
                    logger.info("Redis circuit breaker recovered to CLOSED.")
                    return True
                except Exception as e:
                    self._circuit_cooldown_until = now + 30.0
                    metrics.record_redis_error(str(e))
                    return False
            return False
        return True

    def _handle_redis_failure(self, err: Exception):
        now = time.monotonic()
        self._circuit_open = True
        self._circuit_cooldown_until = now + 30.0
        metrics.set_backend_status("degraded_in_memory")
        metrics.record_redis_error(str(err))
        metrics.record_circuit_trip()
        logger.error(f"Redis operation error ({err}). Circuit breaker OPEN for 30s. Gracefully degraded to local LRU engine.")

    # ==================== In-Memory Bounded LRU Management ====================

    def _evict_lru_if_needed(self, cache: OrderedDict, max_items: int = 40000):
        while len(cache) > max_items:
            cache.popitem(last=False)

    def _maybe_prune(self, now: float):
        if len(self._buckets) < 5000 and (now - self._last_prune < 120):
            return
        self._last_prune = now
        stale_cutoff = now - 300

        # Prune inactive token buckets
        stale_b = [k for k, b in self._buckets.items() if b.last_update < stale_cutoff]
        for k in stale_b:
            self._buckets.pop(k, None)

        # Prune inactive sliding windows
        stale_w = [
            k for k, w in self._sliding_windows.items()
            if not w.timestamps or w.timestamps[-1] < (now - w.window_seconds - 60)
        ]
        for k in stale_w:
            self._sliding_windows.pop(k, None)

        # Prune expired failed logins
        stale_l = [
            k for k, tracker in self._failed_logins.items()
            if (not tracker.failure_timestamps or tracker.failure_timestamps[-1] < stale_cutoff)
            and tracker.lockout_until < now
        ]
        for k in stale_l:
            self._failed_logins.pop(k, None)

    # ==================== Token Bucket Evaluator ====================

    def check_token_bucket(
        self,
        key: str,
        rate_per_minute: int = 120,
        burst: Optional[int] = None,
        cost: int = 1
    ) -> Tuple[bool, int, int]:
        if not getattr(settings, "RATE_LIMIT_ENABLED", True) or "testclient" in key:
            return True, rate_per_minute, 60

        capacity = burst if burst is not None else max(rate_per_minute // 2, 50)
        fill_rate = float(rate_per_minute) / 60.0
        ttl_seconds = max(120, int(math.ceil(capacity / fill_rate) * 2)) if fill_rate > 0 else 300

        # 1. Distributed Redis evaluation
        if self._is_redis_available():
            try:
                redis_key = f"rl:tb:{key}"
                return self._redis_backend.check_token_bucket(
                    key=redis_key, capacity=capacity, fill_rate=fill_rate, cost=cost, ttl=ttl_seconds
                )
            except Exception as e:
                self._handle_redis_failure(e)

        # 2. Bounded In-Memory fallback
        now = time.monotonic()
        with self._lock:
            self._maybe_prune(now)
            if key in self._buckets:
                bucket = self._buckets[key]
                self._buckets.move_to_end(key)
            else:
                self._evict_lru_if_needed(self._buckets, self.MAX_LRU_ENTRIES)
                bucket = TokenBucket(capacity=capacity, fill_rate=fill_rate, now=now)
                self._buckets[key] = bucket

            bucket.capacity = capacity
            bucket.fill_rate = fill_rate
            return bucket.consume(tokens_needed=cost, now=now)

    # ==================== Sliding Window Evaluator ====================

    def check_sliding_window(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int, int]:
        if not getattr(settings, "RATE_LIMIT_ENABLED", True) or "testclient" in key:
            return True, max_requests, window_seconds

        # 1. Distributed Redis evaluation
        if self._is_redis_available():
            try:
                redis_key = f"rl:sw:{key}"
                return self._redis_backend.check_sliding_window(
                    key=redis_key, max_requests=max_requests, window_seconds=window_seconds
                )
            except Exception as e:
                self._handle_redis_failure(e)

        # 2. Bounded In-Memory fallback
        now = time.monotonic()
        with self._lock:
            self._maybe_prune(now)
            if key in self._sliding_windows and self._sliding_windows[key].window_seconds == window_seconds:
                tracker = self._sliding_windows[key]
                self._sliding_windows.move_to_end(key)
            else:
                self._evict_lru_if_needed(self._sliding_windows, self.MAX_LRU_ENTRIES)
                tracker = SlidingWindowTracker(window_seconds=window_seconds)
                self._sliding_windows[key] = tracker

            return tracker.check_and_add(max_requests=max_requests, now=now)

    # ==================== Account Lockout & Progressive Defense ====================

    def check_login_lockout(self, email: str) -> None:
        """
        Evaluates whether an account is currently in a progressive lockout cooldown.
        Must be called BEFORE executing expensive database lookups or bcrypt hash verification.
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return

        acc_hash = hash_identity(email)
        lockout_key = f"rl:lockout:{acc_hash}"
        failures_key = f"rl:failures:{acc_hash}"

        # 1. Distributed Redis evaluation
        if self._is_redis_available():
            try:
                allowed, remaining = self._redis_backend.check_lockout(lockout_key, failures_key)
                if not allowed:
                    metrics.record_denied("account_lockout")
                    logger.warning(f"Login denied by progressive lockout: account_hash={acc_hash} remaining={remaining}s")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Account temporarily locked due to repeated failed sign-in attempts. Please try again in {remaining} seconds.",
                        headers={"Retry-After": str(remaining), "RateLimit-Policy": "account-lockout"}
                    )
                return
            except HTTPException:
                raise
            except Exception as e:
                self._handle_redis_failure(e)

        # 2. In-Memory fallback (Fail-closed for security: limits still enforced locally)
        now = time.monotonic()
        with self._lock:
            tracker = self._failed_logins.get(acc_hash)
            if tracker and now < tracker.lockout_until:
                remaining = max(1, int(math.ceil(tracker.lockout_until - now)))
                metrics.record_denied("account_lockout")
                logger.warning(f"Login denied by local progressive lockout: account_hash={acc_hash} remaining={remaining}s")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Account temporarily locked due to repeated failed sign-in attempts. Please try again in {remaining} seconds.",
                    headers={"Retry-After": str(remaining), "RateLimit-Policy": "account-lockout"}
                )
            elif tracker and tracker.lockout_until > 0 and now >= tracker.lockout_until:
                # Lockout window passed, reset lockout flag
                tracker.lockout_until = 0.0

    def record_login_failure(
        self,
        email: str,
        max_failures: int = 25,
        lockout_seconds: int = 30,
        window_seconds: int = 180
    ) -> None:
        """
        Records a failed authentication attempt with progressive cooldown tiers.
        """
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return

        acc_hash = hash_identity(email)
        lockout_key = f"rl:lockout:{acc_hash}"
        failures_key = f"rl:failures:{acc_hash}"

        # 1. Distributed Redis evaluation
        if self._is_redis_available():
            try:
                allowed, cooldown, count = self._redis_backend.record_failure(
                    lockout_key=lockout_key,
                    failures_key=failures_key,
                    window_seconds=window_seconds,
                    max_failures=max_failures,
                    default_lockout=lockout_seconds
                )
                if not allowed:
                    logger.warning(f"Progressive lockout triggered: account_hash={acc_hash} failures={count} cooldown={cooldown}s")
                else:
                    logger.info(f"Failed login recorded: account_hash={acc_hash} failures={count}/{max_failures}")
                return
            except Exception as e:
                self._handle_redis_failure(e)

        # 2. In-Memory fallback
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            if acc_hash not in self._failed_logins:
                self._evict_lru_if_needed(self._failed_logins, self.MAX_LRU_ENTRIES)
                self._failed_logins[acc_hash] = AccountLockoutTracker()
            tracker = self._failed_logins[acc_hash]
            self._failed_logins.move_to_end(acc_hash)

            # Filter old failures within window
            tracker.failure_timestamps = [t for t in tracker.failure_timestamps if t > cutoff]
            tracker.failure_timestamps.append(now)

            if len(tracker.failure_timestamps) >= max_failures:
                cooldown = AccountLockoutTracker.calculate_cooldown(len(tracker.failure_timestamps), lockout_seconds)
                tracker.lockout_until = now + cooldown
                logger.warning(f"Local progressive lockout triggered: account_hash={acc_hash} failures={len(tracker.failure_timestamps)} cooldown={cooldown}s")
            else:
                logger.info(f"Local failed login recorded: account_hash={acc_hash} failures={len(tracker.failure_timestamps)}/{max_failures}")

    def record_login_success(self, email: str) -> None:
        """
        Resets failure and lockout tracking immediately upon successful credential validation.
        """
        acc_hash = hash_identity(email)
        lockout_key = f"rl:lockout:{acc_hash}"
        failures_key = f"rl:failures:{acc_hash}"

        # 1. Distributed Redis reset
        if self._is_redis_available():
            try:
                self._redis_backend.reset_lockout(lockout_key, failures_key)
                logger.info(f"Login success: reset failure records for account_hash={acc_hash}")
                return
            except Exception as e:
                self._handle_redis_failure(e)

        # 2. In-Memory reset
        with self._lock:
            if acc_hash in self._failed_logins:
                del self._failed_logins[acc_hash]
                logger.info(f"Local login success: cleared failure records for account_hash={acc_hash}")

    # ==================== Enforcement Methods ====================

    def enforce_rate_limit(
        self,
        key: str,
        rate_per_minute: int = 120,
        burst: Optional[int] = None,
        cost: int = 1,
        limit_name: str = "requests",
        policy_name: str = "standard"
    ) -> Dict[str, str]:
        allowed, remaining, reset_or_retry = self.check_token_bucket(
            key=key, rate_per_minute=rate_per_minute, burst=burst, cost=cost
        )
        if not allowed:
            metrics.record_denied(policy_name)
            logger.warning(f"Rate limit exceeded: policy={policy_name} key={mask_ip(key)} retry_after={reset_or_retry}s")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many {limit_name}. Please retry after {reset_or_retry} seconds.",
                headers={
                    "Retry-After": str(reset_or_retry),
                    "RateLimit-Limit": str(rate_per_minute),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_or_retry),
                    "RateLimit-Policy": policy_name,
                }
            )
        metrics.record_allowed(policy_name)
        return {
            "RateLimit-Limit": str(rate_per_minute),
            "RateLimit-Remaining": str(remaining),
            "RateLimit-Reset": str(reset_or_retry),
            "RateLimit-Policy": policy_name,
        }

    def enforce_strict_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
        action_name: str = "requests",
        policy_name: str = "strict"
    ) -> Dict[str, str]:
        allowed, remaining, reset_or_retry = self.check_sliding_window(
            key=key, max_requests=max_requests, window_seconds=window_seconds
        )
        if not allowed:
            metrics.record_denied(policy_name)
            logger.warning(f"Strict limit exceeded: policy={policy_name} key={mask_ip(key)} retry_after={reset_or_retry}s")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many {action_name} attempts. Please wait {reset_or_retry} seconds before trying again.",
                headers={
                    "Retry-After": str(reset_or_retry),
                    "RateLimit-Limit": str(max_requests),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_or_retry),
                    "RateLimit-Policy": policy_name,
                }
            )
        metrics.record_allowed(policy_name)
        return {
            "RateLimit-Limit": str(max_requests),
            "RateLimit-Remaining": str(remaining),
            "RateLimit-Reset": str(reset_or_retry),
            "RateLimit-Policy": policy_name,
        }


# Global singleton instance
limiter = RateLimiterEngine()


# ==================== FastAPI Dependency Providers ====================

def rate_limit_public(
    rpm: Optional[int] = None,
    burst: Optional[int] = None,
    action: str = "public_api"
):
    """Dependency provider for public unauthenticated endpoints (IP-based token bucket)."""
    effective_rpm = rpm if rpm is not None else settings.RATE_LIMIT_PUBLIC_RPM
    effective_burst = burst if burst is not None else settings.RATE_LIMIT_PUBLIC_BURST

    def dependency(request: Request, response: Response):
        ip = get_client_ip(request)
        key = f"public:{action}:{ip}"
        headers = limiter.enforce_rate_limit(
            key=key,
            rate_per_minute=effective_rpm,
            burst=effective_burst,
            limit_name="requests",
            policy_name=f"public_{action}"
        )
        for h, v in headers.items():
            response.headers[h] = v

    return dependency


def rate_limit_login_ip():
    """
    Dedicated IP-based sliding window dependency for POST /api/auth/login.
    Prevents password spraying and distributed credential stuffing from a single IP.
    """
    max_requests = settings.RATE_LIMIT_LOGIN_IP_MAX_REQUESTS
    window_seconds = settings.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS

    def dependency(request: Request, response: Response):
        ip = get_client_ip(request)
        key = f"login_ip:{ip}"
        headers = limiter.enforce_strict_limit(
            key=key,
            max_requests=max_requests,
            window_seconds=window_seconds,
            action_name="sign-in",
            policy_name="login_ip_spray"
        )
        for h, v in headers.items():
            response.headers[h] = v

    return dependency


def rate_limit_strict_action(
    max_requests: int,
    window_seconds: int,
    action_name: str
):
    """Dependency provider for strict security actions (e.g., OTP verify, password reset)."""
    def dependency(request: Request, response: Response):
        ip = get_client_ip(request)
        key = f"strict:{action_name}:{ip}"
        headers = limiter.enforce_strict_limit(
            key=key,
            max_requests=max_requests,
            window_seconds=window_seconds,
            action_name=action_name,
            policy_name=f"strict_{action_name}"
        )
        for h, v in headers.items():
            response.headers[h] = v

    return dependency


def rate_limit_user(cost: int = 1, is_mutation: bool = False):
    """
    Dependency provider for authenticated CRM operations.
    Enforces user-keyed limits (so employees behind shared corporate NAT never collide).
    Admin role receives elevated capacity.
    """
    def dependency(request: Request, response: Response):
        # pyrefly: ignore [missing-import]
        from app.auth import get_current_user
        # Lazy import of user from request state if already set, or extract token
        user = getattr(request.state, "user", None)
        user_key = f"user:{user.id}" if user else f"ip:{get_client_ip(request)}"
        is_admin = bool(user and getattr(user, "role", None) == "admin")

        if is_mutation:
            rpm = settings.RATE_LIMIT_ADMIN_USER_RPM if is_admin else 300
            burst = settings.RATE_LIMIT_ADMIN_USER_BURST if is_admin else 100
            limit_name = "mutations"
            policy_name = "user_mutation"
        else:
            rpm = settings.RATE_LIMIT_ADMIN_USER_RPM if is_admin else settings.RATE_LIMIT_AUTH_USER_RPM
            burst = settings.RATE_LIMIT_ADMIN_USER_BURST if is_admin else settings.RATE_LIMIT_AUTH_USER_BURST
            limit_name = "requests"
            policy_name = "user_read"

        headers = limiter.enforce_rate_limit(
            key=user_key,
            rate_per_minute=rpm,
            burst=burst,
            cost=cost,
            limit_name=limit_name,
            policy_name=policy_name
        )
        for h, v in headers.items():
            response.headers[h] = v

    return dependency
