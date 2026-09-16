import time
from typing import Dict, List, Tuple
from fastapi import Request, HTTPException, status

class RateLimiter:
    """
    In-memory rate limiter with sliding window tracking and brute-force lockout protection.
    Thread-safe for typical async FastAPI concurrency.
    """
    def __init__(self):
        # Maps key -> list of timestamp floats
        self._requests: Dict[str, List[float]] = {}
        # Maps identifier (IP or email) -> (failed_count, lockout_until_timestamp)
        self._failed_attempts: Dict[str, Tuple[int, float]] = {}

    def _clean_old_entries(self, key: str, window_seconds: int, now: float):
        if key in self._requests:
            cutoff = now - window_seconds
            self._requests[key] = [t for t in self._requests[key] if t > cutoff]
            if not self._requests[key]:
                del self._requests[key]

    def check_rate_limit(self, key: str, max_requests: int = 10, window_seconds: int = 60, action: str = "requests"):
        now = time.time()
        self._clean_old_entries(key, window_seconds, now)
        
        timestamps = self._requests.get(key, [])
        if len(timestamps) >= max_requests:
            retry_after = int(window_seconds - (now - timestamps[0])) if timestamps else window_seconds
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded for {action}. Too many requests. Please retry after {max(1, retry_after)} seconds.",
                headers={"Retry-After": str(max(1, retry_after))}
            )
        
        if key not in self._requests:
            self._requests[key] = []
        self._requests[key].append(now)

    def check_lockout(self, identifier: str):
        now = time.time()
        if identifier in self._failed_attempts:
            count, lockout_until = self._failed_attempts[identifier]
            if now < lockout_until:
                remaining_secs = int(lockout_until - now)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Account temporarily locked due to repeated failed login attempts. Please try again in {remaining_secs} seconds.",
                    headers={"Retry-After": str(remaining_secs)}
                )
            elif count >= 5 and now >= lockout_until:
                # Lockout period expired, reset counter
                del self._failed_attempts[identifier]

    def record_failure(self, identifier: str, max_failures: int = 5, lockout_seconds: int = 900):
        """
        Record a failed authentication attempt. 5 consecutive failures triggers a 15-minute (900s) lockout.
        """
        now = time.time()
        count, lockout_until = self._failed_attempts.get(identifier, (0, 0.0))
        if now < lockout_until:
            return  # Already locked out

        new_count = count + 1
        if new_count >= max_failures:
            lockout_until = now + lockout_seconds
            self._failed_attempts[identifier] = (new_count, lockout_until)
        else:
            self._failed_attempts[identifier] = (new_count, 0.0)

    def record_success(self, identifier: str):
        """Reset failed attempt counters upon successful authentication."""
        if identifier in self._failed_attempts:
            del self._failed_attempts[identifier]

# Global singleton rate limiter instance
limiter = RateLimiter()

def get_client_ip(request: Request) -> str:
    """Extract real client IP considering reverse proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"
