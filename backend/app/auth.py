import uuid
# pyrefly: ignore [missing-import]
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
# pyrefly: ignore [missing-import]
from fastapi import Request, Depends, HTTPException, status
# pyrefly: ignore [missing-import]
from fastapi.security import OAuth2PasswordBearer
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not hashed_password:
        return False
    try:
        pwd_bytes = plain_password.encode('utf-8')[:72]
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, iat_override: Optional[int] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    iat_val = iat_override if iat_override is not None else int(now.timestamp())
    to_encode.update({
        "exp": expire,
        "iat": iat_val,
        "jti": str(uuid.uuid4())
    })
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # 1. Check HttpOnly cookie first, then Bearer token
    raw_token = request.cookies.get("access_token") or token
    if not raw_token:
        raise credentials_exception
    
    if raw_token.startswith("Bearer "):
        raw_token = raw_token[7:].strip()
        
    try:
        payload = jwt.decode(raw_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        iat: Optional[int] = payload.get("iat")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact system administrator."
        )
        
    # Session invalidation check: if token was issued on or before user.token_revoked_at
    if user.token_revoked_at and iat is not None:
        rev_dt = user.token_revoked_at
        if rev_dt.tzinfo is None:
            rev_dt = rev_dt.replace(tzinfo=timezone.utc)
        revoked_timestamp = int(rev_dt.timestamp())
        if iat <= revoked_timestamp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been terminated. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    return user

def require_role(required_role: str):
    """Dependency that enforces role-based access control (RBAC)."""
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role != required_role and current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. '{required_role}' privilege is required for this operation."
            )
        return current_user
    return role_checker

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that strictly enforces the Admin role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. 'admin' privilege is required for this operation."
        )
    return current_user


def generate_employee_setup_token(user: User, base_url: str, expires_hours: int = 48) -> tuple[str, str, str, str]:
    """
    Generates a cryptographically secure, signed employee onboarding setup token.
    Returns: (token, token_hash, setup_url, invitation_code)
    """
    import hashlib
    import secrets
    import urllib.parse
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=expires_hours)
    inv_code = secrets.token_hex(4).upper()  # 8 hex characters, e.g. '8B4A2F1C'

    jwt_payload = {
        "sub": user.email.lower().strip(),
        "user_id": user.id,
        "purpose": "employee_setup",
        "code": inv_code,
        "exp": expire,
        "iat": int(now.timestamp()),
        "jti": str(uuid.uuid4())
    }
    token = jwt.encode(jwt_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    clean_base = (base_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip('/')
    quoted_token = urllib.parse.quote(token)
    quoted_email = urllib.parse.quote(user.email.strip())
    setup_url = f"{clean_base}/setup-employee?token={quoted_token}&email={quoted_email}"

    return token, token_hash, setup_url, f"#{inv_code}"


def verify_employee_setup_token(token_str: str, submitted_email: Optional[str], db: Session) -> Optional[User]:
    """
    Verifies an employee setup token using multiple layers:
    1. Signed JWT validation (cryptographically verifies payload, purpose, and expiration).
    2. Exact sha256 hash match against user.setup_token_hash.
    3. Multi-token comma-separated hash match against user.setup_token_hash.
    4. Fallback lookup by email if valid unexpired invitation exists.
    """
    import hashlib
    from sqlalchemy import func
    clean_token = token_str.strip()
    if not clean_token:
        return None

    # Layer 1: JWT Signature Verification
    try:
        payload = jwt.decode(clean_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose") == "employee_setup":
            user_id = payload.get("user_id")
            sub_email = payload.get("sub")
            user = None
            if user_id:
                user = db.query(User).filter(User.id == user_id).first()
            if not user and sub_email:
                user = db.query(User).filter(func.lower(func.trim(User.email)) == sub_email.lower().strip()).first()
            if user:
                # Check revocation
                if user.token_revoked_at:
                    token_iat = payload.get("iat")
                    if token_iat:
                        iat_dt = datetime.fromtimestamp(token_iat, tz=timezone.utc).replace(tzinfo=None)
                        if iat_dt <= user.token_revoked_at:
                            return None
                return user
    except (JWTError, Exception):
        pass

    # Layer 2: SHA256 Hash Matching (exact match)
    token_hash = hashlib.sha256(clean_token.encode("utf-8")).hexdigest()
    user = db.query(User).filter(User.setup_token_hash == token_hash).first()
    if user:
        return user

    # Layer 3: Comma-separated hash list matching for submitted email
    if submitted_email:
        clean_email = submitted_email.strip().lower()
        user_by_email = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()
        if user_by_email and user_by_email.setup_token_hash:
            hashes = [h.strip() for h in user_by_email.setup_token_hash.split(",") if h.strip()]
            if token_hash in hashes:
                return user_by_email

    # Layer 4: Scan all pending setup users for comma-separated match
    pending_users = db.query(User).filter(
        User.setup_token_hash.isnot(None),
        User.is_setup_complete == False
    ).all()
    for candidate in pending_users:
        if candidate.setup_token_hash:
            hashes = [h.strip() for h in candidate.setup_token_hash.split(",") if h.strip()]
            if token_hash in hashes:
                return candidate

    return None


