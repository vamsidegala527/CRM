import os
import secrets
from datetime import datetime, timedelta
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, BackgroundTasks
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from sqlalchemy import func

# pyrefly: ignore [missing-import]
from google.oauth2 import id_token
# pyrefly: ignore [missing-import]
from google.auth.transport import requests as google_requests

import hashlib
from app.database import get_db
from app.models import User
from app.schemas import (
    UserCreate, UserResponse, Token, UserLogin, GoogleAuthRequest,
    VerifyEmailRequest, ResendVerificationRequest, ForgotPasswordRequest, ResetPasswordRequest,
    EmployeeSetupRequest, ChangePasswordRequest
)
from typing import Optional
from app.auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, oauth2_scheme, verify_employee_setup_token
)
from app.config import settings
from app.rate_limiter import limiter, get_client_ip
from app.email_service import send_verification_email, send_password_reset_email, EmailDeliveryError

def safe_send_verification_email(to_email: str, user_name: str, code: str, frontend_url: str = None) -> None:
    """Dispatches verification email safely in background without blocking response."""
    try:
        send_verification_email(to_email, user_name, code, frontend_url=frontend_url)
    except Exception as exc:
        print(f"⚠️ [BACKGROUND EMAIL] Verification email notice for {to_email}: {exc}")

def safe_send_password_reset_email(to_email: str, user_name: str, token: str, frontend_url: str = None) -> None:
    """Dispatches password reset email safely in background without blocking response."""
    try:
        send_password_reset_email(to_email, user_name, token, frontend_url=frontend_url)
    except Exception as exc:
        print(f"⚠️ [BACKGROUND EMAIL] Password reset email notice for {to_email}: {exc}")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

IS_PROD = (
    os.getenv("ENVIRONMENT", "").lower() in ("production", "prod") or
    os.getenv("RENDER", "").lower() == "true" or
    os.getenv("COOKIE_SECURE", "false").lower() == "true"
)

def set_auth_cookie(response: Response, token: str):
    """Sets an HttpOnly, SameSite=Lax cookie containing the JWT access token."""
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=IS_PROD,
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"register_ip:{client_ip}", max_requests=30, window_seconds=60, action="registration")

    email_clean = user_in.email.strip().lower()
    
    # Case-insensitive check for existing user
    existing_user = db.query(User).filter(func.lower(func.trim(User.email)) == email_clean).first()
    
    hashed_pwd = get_password_hash(user_in.password)
    # Generate secure 6-digit verification code
    verification_code = f"{secrets.randbelow(1000000):06d}"
    verification_expires = datetime.utcnow() + timedelta(hours=24)

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user account with this email address already exists."
        )
    else:
        db_user = User(
            email=email_clean,
            full_name=user_in.full_name,
            hashed_password=hashed_pwd,
            is_active=True,
            is_verified=False,
            first_login=True,
            login_count=0,
            verification_token=verification_code,
            verification_token_expires=verification_expires,
            role="admin",
            is_setup_complete=True
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    fe_url = get_frontend_base_url(request)
    background_tasks.add_task(
        safe_send_verification_email,
        db_user.email,
        db_user.full_name or "User",
        verification_code,
        fe_url
    )

    return {
        "message": f"Account created successfully. Verification code sent to {db_user.email}.",
        "id": db_user.id,
        "email": db_user.email,
        "full_name": db_user.full_name,
        "user": UserResponse.model_validate(db_user),
        "verification_token": verification_code if not IS_PROD else None
    }


@router.post("/verify-email", status_code=status.HTTP_200_OK)
def verify_email(request: Request, payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verifies a user's email address using a valid 6-digit verification code or token."""
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"verify_ip:{client_ip}", max_requests=30, window_seconds=300, action="verification attempt")

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
    user.first_login = False
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()
    db.refresh(user)

    return {"message": "Email verified successfully.", "is_verified": True, "email": user.email}


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generates and resends a 6-digit email verification code to a registered user in background."""
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"resend_verify:{client_ip}", max_requests=15, window_seconds=300, action="verification resend")

    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email_clean).first()
    
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

    fe_url = get_frontend_base_url(request)
    background_tasks.add_task(
        safe_send_verification_email,
        user.email,
        user.full_name or "User",
        verification_code,
        fe_url
    )

    return {
        "message": f"Verification email successfully sent to {user.email}.",
        "verification_token": verification_code if not IS_PROD else None
    }


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generates a secure password reset token and dispatches reset email in background."""
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"forgot_pwd:{client_ip}", max_requests=15, window_seconds=300, action="password reset request")

    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(func.trim(User.email)) == email_clean).first()

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

    fe_url = get_frontend_base_url(request)
    background_tasks.add_task(
        safe_send_password_reset_email,
        user.email,
        user.full_name or "User",
        reset_token,
        fe_url
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
    login_key = f"login:{email_clean}:{client_ip}"

    # 1. Check if this specific email+IP compound is locked out due to repeated failed attempts
    limiter.check_lockout(login_key)

    user = db.query(User).filter(func.lower(func.trim(User.email)) == email_clean).first()
    
    # 2. Unrecognized User: entered email does not belong to any employee/admin account
    if not user:
        limiter.record_failure(
            login_key,
            max_failures=settings.RATE_LIMIT_MAX_FAILURES,
            lockout_seconds=settings.RATE_LIMIT_LOCKOUT_SECONDS,
            window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your account was not found. Please contact company administrator to receive the account setup email."
        )

    # 3. Deactivated / Inactive account check
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive account. Please contact system administrator."
        )

    # 4. Setup Pending User: employee account exists but setup is still pending
    if user.role == "employee" and not user.is_setup_complete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please complete your account setup. Check your email for the account setup instructions."
        )

    # 5. Credential Verification for Setup Completed Employee & Admin
    if not verify_password(user_credentials.password, user.hashed_password):
        limiter.record_failure(
            login_key,
            max_failures=settings.RATE_LIMIT_MAX_FAILURES,
            lockout_seconds=settings.RATE_LIMIT_LOCKOUT_SECONDS,
            window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 6. Authentication succeeded: immediately reset failure tracker for this email+IP
    limiter.record_success(login_key)

    # Track login count and first_login status
    current_count = user.login_count if user.login_count is not None else 0
    is_first_time = (current_count == 0)

    if is_first_time:
        user.login_count = 1
        user.first_login = True
    else:
        user.login_count = current_count + 1
        user.first_login = False

    # Clear any previous session revocation timestamp on successful new login
    user.token_revoked_at = None
    db.commit()
    db.refresh(user)

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
            detail="Google sign-in could not be completed. Please try again."
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
    google_key = f"google:{email_clean}:{client_ip}"
    limiter.check_lockout(google_key)

    # Step 1: Check by google_id
    user = db.query(User).filter(User.google_id == google_user_id).first()

    if not user:
        # Step 2: Check by email
        user = db.query(User).filter(func.lower(func.trim(User.email)) == email_clean).first()
        if user:
            # Account linking
            user.google_id = google_user_id
            user.is_verified = True
            user.first_login = False
            db.commit()
            db.refresh(user)
        else:
            # Unrecognized user: do not create account automatically
            limiter.record_failure(
                google_key,
                max_failures=settings.RATE_LIMIT_MAX_FAILURES,
                lockout_seconds=settings.RATE_LIMIT_LOCKOUT_SECONDS,
                window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Your account was not found. Please contact company administrator to receive the account setup email."
            )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive account. Please contact system administrator."
        )

    if user.role == "employee" and not user.is_setup_complete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please complete your account setup. Check your email for the account setup instructions."
        )

    # Authentication succeeded: reset failure tracker for this email+IP
    limiter.record_success(google_key)

    # Clear any previous session revocation timestamp on successful Google sign-in
    user.token_revoked_at = None
    db.commit()
    db.refresh(user)

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
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Terminates user session, records token revocation timestamp in DB,
    and removes the HttpOnly access_token cookie.
    """
    try:
        user = get_current_user(request=request, token=token, db=db)
        if user:
            user.token_revoked_at = datetime.utcnow()
            db.commit()
    except Exception:
        pass  # Session already expired or missing; still clear cookie

    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        secure=IS_PROD,
        samesite="lax"
    )
    return {"message": "Logged out successfully. Session invalidated."}


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/setup-employee", status_code=status.HTTP_200_OK)
def setup_employee_account(
    request: Request,
    payload: EmployeeSetupRequest,
    db: Session = Depends(get_db)
):
    """
    Public employee onboarding endpoint:
    - Finds the employee by cryptographically verifying the setup token (JWT, exact sha256 hash, or multi-hash list).
    - Validates link expiration and email match.
    - Sets password, sets is_setup_complete=True, and invalidates the token.
    """
    client_ip = get_client_ip(request)
    limiter.check_rate_limit(f"setup_ip:{client_ip}", max_requests=30, window_seconds=300, action="employee setup attempt")

    token_raw = payload.token.strip()
    submitted_email = payload.email.strip().lower()

    # Multi-layered token verification (JWT signature, exact hash, comma-separated list)
    user = verify_employee_setup_token(token_raw, submitted_email, db)

    if not user:
        # Check by email for diagnostic logging and precise user feedback
        user_by_email = db.query(User).filter(func.lower(func.trim(User.email)) == submitted_email).first()
        if user_by_email:
            print(f"⚠️ [SETUP REJECTED] Email: {submitted_email} | User ID: {user_by_email.id} | Setup complete: {user_by_email.is_setup_complete} | Active: {user_by_email.is_active}")
            if user_by_email.is_setup_complete:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This employee account is already set up! You can log in directly with your email and password."
                )
            if not user_by_email.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This employee account is currently deactivated. Please contact your HR administrator."
                )
            if user_by_email.setup_token_expires and user_by_email.setup_token_expires < datetime.utcnow():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This employee setup link has expired. Please contact your administrator to click 'Copy Setup Link' in the HR Portal."
                )
        else:
            print(f"⚠️ [SETUP REJECTED] No employee account found with email {submitted_email}")

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unrecognized setup link. If you received multiple emails, please use the latest link, or ask your administrator to click 'Copy Setup Link' in the HR Portal to give you an active link."
        )

    if user.setup_token_expires and user.setup_token_expires < datetime.utcnow():
        print(f"⚠️ [SETUP REJECTED] Setup link for {user.email} expired at {user.setup_token_expires}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This employee setup link has expired. Please contact your administrator to request a new invitation email or link."
        )

    if user.email.strip().lower() != submitted_email:
        print(f"⚠️ [SETUP REJECTED] Email mismatch: token owner is {user.email}, but submitted email is {submitted_email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address does not match the employee account invitation."
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.is_setup_complete = True
    user.is_verified = True
    user.first_login = False
    user.setup_token_hash = None
    user.setup_token_expires = None
    user.token_revoked_at = datetime.utcnow()
    db.commit()

    print(f"✅ [SETUP COMPLETE] Employee account {user.email} (ID: {user.id}) successfully activated.")
    return {"message": "Account setup successfully completed! You can now log in with your credentials."}


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allows an authenticated user or employee to change their own password.
    Validates the current password and revokes any active sessions across devices.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.token_revoked_at = datetime.utcnow()
    db.commit()

    return {"message": "Password changed successfully. Please log in again with your new password."}

