import os
import secrets
from datetime import datetime, timedelta
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from sqlalchemy import func

# pyrefly: ignore [missing-import]
from google.oauth2 import id_token
# pyrefly: ignore [missing-import]
from google.auth.transport import requests as google_requests

from app.database import get_db
from app.models import User
from app.schemas import (
    UserCreate, UserResponse, Token, UserLogin, GoogleAuthRequest,
    VerifyEmailRequest, ResendVerificationRequest, ForgotPasswordRequest, ResetPasswordRequest
)
from app.auth import verify_password, get_password_hash, create_access_token, get_current_user
from app.config import settings
from app.rate_limiter import limiter, get_client_ip
from app.email_service import send_verification_email, send_password_reset_email, EmailDeliveryError

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

IS_PROD = (
    os.getenv("ENVIRONMENT", "").lower() in ("production", "prod") or
    os.getenv("RENDER", "").lower() == "true"
)

def set_auth_cookie(response: Response, token: str):
    """Sets a secure HttpOnly, SameSite=Lax cookie containing the JWT access token."""
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    # True by default; in local dev HTTP it can be relaxed if explicitly configured
    is_secure = os.getenv("COOKIE_SECURE", "false" if os.getenv("ENVIRONMENT") == "development" else "true").lower() == "true"
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=max_age,
        path="/"
    )

def get_frontend_base_url(request: Request) -> str:
    """
    Dynamically extracts the frontend origin from request headers (Origin or Referer)
    falling back to settings.FRONTEND_URL. Ensures no trailing slash.
    This guarantees that links generated in emails always match the user's actual deployed frontend.
    """
    origin = request.headers.get("origin")
    if origin and origin.startswith("http"):
        return origin.rstrip('/')
    referer = request.headers.get("referer")
    if referer and referer.startswith("http"):
        import urllib.parse
        parsed = urllib.parse.urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}".rstrip('/')
    return settings.FRONTEND_URL.strip().rstrip('/')


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register_user(
    request: Request,
    response: Response,
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"register_ip:{client_ip}", max_requests=10, window_seconds=60, action="registration")

    email_clean = user_in.email.strip().lower()
    
    # Case-insensitive check for existing user
    existing_user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user account with this email address already exists."
        )
    
    hashed_pwd = get_password_hash(user_in.password)
    # Generate secure 6-digit verification code
    verification_code = f"{secrets.randbelow(1000000):06d}"
    verification_expires = datetime.utcnow() + timedelta(hours=24)

    db_user = User(
        email=email_clean,
        full_name=user_in.full_name,
        hashed_password=hashed_pwd,
        is_active=True,
        is_verified=False,
        verification_token=verification_code,
        verification_token_expires=verification_expires,
        role="user"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    try:
        fe_url = get_frontend_base_url(request)
        send_verification_email(db_user.email, db_user.full_name or "User", verification_code, frontend_url=fe_url)
    except EmailDeliveryError as email_err:
        print(f"⚠️ Verification email delivery notice: {email_err}")

    return {
        "message": f"Account created successfully. Verification code sent to {db_user.email}.",
        "user": UserResponse.model_validate(db_user),
        "verification_token": verification_code if not IS_PROD else None
    }


@router.post("/verify-email", status_code=status.HTTP_200_OK)
def verify_email(request: Request, payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verifies a user's email address using a valid 6-digit verification code or token."""
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"verify_ip:{client_ip}", max_requests=10, window_seconds=300, action="verification attempt")

    import urllib.parse
    raw_code = (payload.code or payload.token or "").strip()
    if not raw_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code is required."
        )

    clean_code = raw_code
    unquoted_code = urllib.parse.unquote(clean_code).strip()

    user = db.query(User).filter(
        (User.verification_token == clean_code) | (User.verification_token == unquoted_code)
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unrecognized verification code."
        )
    
    if user.verification_token_expires and user.verification_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new verification code."
        )

    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()
    db.refresh(user)

    return {"message": "Email verified successfully.", "is_verified": True, "email": user.email}


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
def resend_verification(request: Request, payload: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Generates and resends a 6-digit email verification code to a registered user."""
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"resend_verify:{client_ip}", max_requests=5, window_seconds=300, action="verification resend")

    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email address not found."
        )

    if user.is_verified:
        return {"message": "This email address is already verified."}

    verification_code = f"{secrets.randbelow(1000000):06d}"
    user.verification_token = verification_code
    user.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    try:
        fe_url = get_frontend_base_url(request)
        send_verification_email(user.email, user.full_name or "User", verification_code, frontend_url=fe_url)
    except EmailDeliveryError as email_err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to send verification email: {str(email_err)}"
        )

    return {
        "message": f"Verification email successfully sent to {user.email}.",
        "verification_token": verification_code if not IS_PROD else None
    }


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generates a secure password reset token and sends a reset email to the registered address."""
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"forgot_pwd:{client_ip}", max_requests=5, window_seconds=300, action="password reset request")

    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email address not found."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive. Please contact support."
        )

    reset_token = secrets.token_urlsafe(32)
    user.reset_password_token = reset_token
    user.reset_password_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    try:
        fe_url = get_frontend_base_url(request)
        send_password_reset_email(user.email, user.full_name or "User", reset_token, frontend_url=fe_url)
    except EmailDeliveryError as email_err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to send password reset email: {str(email_err)}"
        )

    return {
        "message": f"A password reset link has been sent to {user.email}. Please check your email to reset your password."
    }


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Resets user password using a valid reset token and terminates older active sessions."""
    import urllib.parse
    clean_token = payload.token.strip()
    unquoted_token = urllib.parse.unquote(clean_token).strip()

    user = db.query(User).filter(
        (User.reset_password_token == clean_token) | (User.reset_password_token == unquoted_token)
    ).first()
    
    if not user:
        print(f"❌ [RESET-PWD] Token not found in DB. Received: {repr(clean_token)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unrecognized password reset token. If you requested a reset multiple times, please use the newest link in your email, or request a fresh link."
        )

    if user.reset_password_expires and user.reset_password_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token has expired. Please request a new one."
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_password_token = None
    user.reset_password_expires = None
    # Session revocation: invalidate previous sessions on all devices
    user.token_revoked_at = datetime.utcnow()
    db.commit()

    return {"message": "Password has been successfully updated. Please log in with your new password."}


@router.post("/login", response_model=Token)
def login_for_access_token(
    request: Request,
    response: Response,
    user_credentials: UserLogin,
    db: Session = Depends(get_db)
):
    client_ip = get_client_ip(request)
    email_clean = user_credentials.email.strip().lower()

    # Rate limiting and brute force lockout protection
    limiter.check_rate_limit(f"login_ip:{client_ip}", max_requests=15, window_seconds=60, action="login")
    limiter.check_lockout(f"email:{email_clean}")
    limiter.check_lockout(f"ip:{client_ip}")

    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        limiter.record_failure(f"email:{email_clean}")
        limiter.record_failure(f"ip:{client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive account. Please contact system administrator."
        )

    # Authentication succeeded: reset failure trackers
    limiter.record_success(f"email:{email_clean}")
    limiter.record_success(f"ip:{client_ip}")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    # Set secure HttpOnly cookie on response
    set_auth_cookie(response, access_token)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/google", response_model=Token)
def google_auth(
    request: Request,
    response: Response,
    payload: GoogleAuthRequest,
    db: Session = Depends(get_db)
):
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"google_ip:{client_ip}", max_requests=20, window_seconds=60, action="Google authentication")

    if not payload.id_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token is required."
        )

    try:
        client_id = settings.GOOGLE_CLIENT_ID if settings.GOOGLE_CLIENT_ID else None
        id_info = id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            client_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Google ID token: {str(e)}"
        )

    google_user_id = id_info.get("sub")
    email = id_info.get("email")
    email_verified = id_info.get("email_verified", False)
    name = id_info.get("name") or (email.split("@")[0] if email else "Google User")

    if not google_user_id or not email or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account must provide a verified email address."
        )

    email_clean = email.strip().lower()

    # Step 1: Check by google_id
    user = db.query(User).filter(User.google_id == google_user_id).first()

    if not user:
        # Step 2: Check by email
        user = db.query(User).filter(func.lower(User.email) == email_clean).first()
        if user:
            # Account linking
            user.google_id = google_user_id
            user.is_verified = True
            db.commit()
            db.refresh(user)
        else:
            # Step 3: Create new user
            user = User(
                email=email_clean,
                full_name=name,
                hashed_password=None,
                google_id=google_user_id,
                auth_provider="google",
                role="user",
                is_active=True,
                is_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive account. Please contact system administrator."
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    # Set secure HttpOnly cookie on response
    set_auth_cookie(response, access_token)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout_user(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Terminates user session, records token revocation timestamp in DB,
    and removes the HttpOnly access_token cookie.
    """
    try:
        user = get_current_user(request=request, token=None, db=db)
        if user:
            user.token_revoked_at = datetime.utcnow()
            db.commit()
    except Exception:
        pass  # Session already expired or missing; still clear cookie

    is_secure = os.getenv("COOKIE_SECURE", "false" if os.getenv("ENVIRONMENT") == "development" else "true").lower() == "true"
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        secure=is_secure,
        samesite="lax"
    )
    return {"message": "Logged out successfully. Session invalidated."}


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
