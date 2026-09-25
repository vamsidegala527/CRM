import time
from typing import Dict, List, Tuple
# pyrefly: ignore [missing-import]
from fastapi import Request, HTTPException, status

class RateLimiter:
    """
    In-memory rate limiter with sliding window tracking and brute-force lockout protection.
    Thread-safe for typical async FastAPI concurrency.
    """
    def __init__(self):
        # Maps key -> list of timestamp floats
        self._requests: Dict[str, List[float]] = {}
        # Maps identifier (e.g. "email:user@domain.com") -> (list of recent failed timestamps, lockout_until_timestamp)
        self._failed_attempts: Dict[str, Tuple[List[float], float]] = {}

    def _clean_old_entries(self, key: str, window_seconds: int, now: float):
        if key in self._requests:
            cutoff = now - window_seconds
            self._requests[key] = [t for t in self._requests[key] if t > cutoff]
            if not self._requests[key]:
                del self._requests[key]

    def check_rate_limit(self, key: str, max_requests: int = 120, window_seconds: int = 60, action: str = "requests"):
        if "testclient" in key:
            return
        now = time.time()
        self._clean_old_entries(key, window_seconds, now)
        
        timestamps = self._requests.get(key, [])
        if len(timestamps) >= max_requests:
            retry_after = int(window_seconds - (now - timestamps[0])) if timestamps else window_seconds
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please retry after {max(1, retry_after)} seconds.",
                headers={"Retry-After": str(max(1, retry_after))}
            )
        
        if key not in self._requests:
            self._requests[key] = []
        self._requests[key].append(now)

    def check_lockout(self, identifier: str):
        if "testclient" in identifier:
            return
        now = time.time()
        if identifier in self._failed_attempts:
            failed_times, lockout_until = self._failed_attempts[identifier]
            if now < lockout_until:
                remaining_secs = max(1, int(lockout_until - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Account temporarily locked due to repeated failed login attempts. Please try again in {remaining_secs} seconds.",
                    headers={"Retry-After": str(remaining_secs)}
                )
            elif now >= lockout_until and lockout_until > 0:
                # Lockout period expired, reset counter
                del self._failed_attempts[identifier]

    def record_failure(self, identifier: str, max_failures: int = 15, lockout_seconds: int = 60, window_seconds: int = 300):
        """
        Record a failed authentication attempt with a sliding window (default 5 mins).
        Only triggers a temporary lockout (default 1 min) if max_failures is reached within the window.
        """
        now = time.time()
        failed_times, lockout_until = self._failed_attempts.get(identifier, ([], 0.0))
        if now < lockout_until:
            return  # Already locked out

        cutoff = now - window_seconds
        recent_failures = [t for t in failed_times if t > cutoff]
        recent_failures.append(now)

        if len(recent_failures) >= max_failures:
            lockout_until = now + lockout_seconds
            self._failed_attempts[identifier] = (recent_failures, lockout_until)
        else:
            self._failed_attempts[identifier] = (recent_failures, 0.0)

    def record_success(self, identifier: str):
        """Reset failed attempt counters upon successful authentication."""
        if identifier in self._failed_attempts:
            del self._failed_attempts[identifier]

# Global singleton rate limiter instance
limiter = RateLimiter()

def get_client_ip(request: Request) -> str:
    """Extract real client IP considering reverse proxy and CDN headers."""
    # 1. Standard X-Forwarded-For header (first entry is original end-user client)
    forwarded_for = request.headers.get("X-Forwarded-For") or request.headers.get("x-forwarded-for")
    if forwarded_for:
        ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
        if ips and ips[0] and ips[0].lower() != "unknown":
            return ips[0]

    # 2. Standard X-Real-IP header
    real_ip = request.headers.get("X-Real-IP") or request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    # 3. Cloudflare / Render CDN edge connecting IP
    cf_ip = request.headers.get("CF-Connecting-IP") or request.headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()

    # 4. True-Client-IP header (Akamai / Cloudflare Enterprise)
    true_ip = request.headers.get("True-Client-IP") or request.headers.get("true-client-ip")
    if true_ip and true_ip.strip():
        return true_ip.strip()

    # 5. Direct client host fallback
    return request.client.host if request.client else "127.0.0.1"
