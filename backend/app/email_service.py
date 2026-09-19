import os
import json
import urllib.request
import urllib.error
from datetime import datetime
from app.config import settings

class EmailDeliveryError(Exception):
    """Custom exception raised when email sending fails."""
    pass

def is_brevo_configured() -> bool:
    """Checks if Brevo API key is provided."""
    key = getattr(settings, "BREVO_API_KEY", "") or os.getenv("BREVO_API_KEY", "")
    return bool(key and key.strip())

def is_email_service_configured() -> bool:
    """Checks if valid email delivery service (Brevo) is configured."""
    return is_brevo_configured()

def _send_brevo_api(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Sends email via Brevo HTTPS REST API (Port 443 - 100% reliable on Render/Cloud)."""
    api_key = (getattr(settings, "BREVO_API_KEY", "") or os.getenv("BREVO_API_KEY", "")).strip()
    from_email = (
        getattr(settings, "BREVO_SENDER_EMAIL", "") or
        os.getenv("BREVO_SENDER_EMAIL", "") or
        "vamsidegala527@gmail.com"
    ).strip()
    from_name = (
        getattr(settings, "BREVO_SENDER_NAME", "") or
        os.getenv("BREVO_SENDER_NAME", "") or
        "HR & Employee Management Portal"
    ).strip()

    payload = {
        "sender": {"name": from_name, "email": from_email},
        "to": [{"email": to_email.strip()}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body
    }

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "HR-Management-Portal/2.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            print(f"✅ [BREVO API] Email successfully delivered to {to_email} (HTTP {resp.status})")
    except urllib.error.HTTPError as http_err:
        err_body = http_err.read().decode("utf-8", errors="ignore")
        print(f"❌ [BREVO API] HTTP Error {http_err.code}: {err_body}")
        raise EmailDeliveryError(f"Brevo email delivery failed ({http_err.code}): {err_body}")
    except Exception as exc:
        print(f"❌ [BREVO API] Network request failed: {exc}")
        raise EmailDeliveryError(f"Brevo email delivery network error: {exc}")

def _send_mime_message(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Dispatches email via Brevo HTTPS API, or logs to console for local development."""
    if is_brevo_configured():
        _send_brevo_api(to_email, subject, html_body, text_body)
        return

    # Fallback: Console log (useful for local development without credentials)
    print("\n" + "=" * 65)
    print("📧 [EMAIL SERVICE - LOCAL CONSOLE DISPATCH]")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print("-" * 65)
    print(text_body)
    print("=" * 65 + "\n")
    raise EmailDeliveryError(
        "Email service not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in environment variables."
    )

def send_verification_email(to_email: str, user_name: str, code: str, frontend_url: str = None) -> None:
    """Sends an account email verification email with a prominent 6-digit code and direct 1-click link."""
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip("/")
    verify_url = f"{base_url}/verify-email?code={code}&email={to_email}"
    subject = f"{code} is your HR & Employee Management Portal verification code"

    text_body = f"""Hello {user_name},

Thank you for registering with HR & Employee Management Portal.

Your 6-digit verification code is:
{code}

You can also verify automatically using this link:
{verify_url}

This code will expire in 24 hours. If you did not create an account, you can safely ignore this message.
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0F19; color: #F1F5F9; margin: 0; padding: 20px; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #111827; border: 1px solid #1F2937; border-radius: 12px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }}
    .brand {{ display: inline-block; background: linear-gradient(135deg, #6366F1, #06B6D4); color: white; font-weight: 800; font-size: 1.1rem; padding: 6px 14px; border-radius: 8px; margin-bottom: 20px; }}
    h1 {{ font-size: 1.4rem; color: #FFFFFF; margin: 0 0 12px; }}
    p {{ font-size: 0.95rem; line-height: 1.6; color: #94A3B8; margin: 0 0 20px; }}
    .code-box {{ background: #1E1B4B; border: 2px dashed #6366F1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }}
    .code {{ font-family: monospace; font-size: 2.2rem; font-weight: 800; letter-spacing: 8px; color: #818CF8; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #6366F1, #4F46E5); color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 20px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }}
    .footer {{ font-size: 0.8rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 24px; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">HR & Employee Management Portal</div>
    <h1>Verify Your Email Address</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>Please enter the following 6-digit verification code to complete your registration:</p>
    
    <div class="code-box">
      <div class="code">{code}</div>
    </div>

    <p style="text-align: center; margin: 10px 0;">— OR —</p>

    <div style="text-align: center;">
      <a href="{verify_url}" class="btn">Verify Account in 1-Click</a>
    </div>

    <div class="footer">
      This code will expire in 24 hours.<br>
      If you did not request this verification, please disregard this email.
    </div>
  </div>
</body>
</html>"""

    _send_mime_message(to_email, subject, html_body, text_body)

def send_password_reset_email(to_email: str, user_name: str, token: str, frontend_url: str = None) -> None:
    """Sends a password-reset email containing a 1-click tokenized reset link."""
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}&email={to_email}"
    subject = "Reset Your Password - HR & Employee Management Portal"

    text_body = f"""Hello {user_name},

A password reset was requested for your account.

Use the link below to choose a new password:
{reset_url}

This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0F19; color: #F1F5F9; margin: 0; padding: 20px; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #111827; border: 1px solid #1F2937; border-radius: 12px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }}
    .brand {{ display: inline-block; background: linear-gradient(135deg, #6366F1, #06B6D4); color: white; font-weight: 800; font-size: 1.1rem; padding: 6px 14px; border-radius: 8px; margin-bottom: 20px; }}
    h1 {{ font-size: 1.4rem; color: #FFFFFF; margin: 0 0 12px; }}
    p {{ font-size: 0.95rem; line-height: 1.6; color: #94A3B8; margin: 0 0 20px; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #6366F1, #4F46E5); color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 20px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }}
    .footer {{ font-size: 0.8rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 24px; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">HR & Employee Management Portal</div>
    <h1>Password Reset Request</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>We received a request to reset your password. Click the button below to choose a new password:</p>
    
    <div style="text-align: center;">
      <a href="{reset_url}" class="btn">Reset My Password</a>
    </div>

    <div class="footer">
      This password-reset link expires in 1 hour.<br>
      If you did not request a password reset, you can safely ignore this email.
    </div>
  </div>
</body>
</html>"""

    _send_mime_message(to_email, subject, html_body, text_body)

def send_employee_setup_email(to_email: str, employee_name: str, token: str, frontend_url: str = None) -> None:
    """Sends a secure first-time login setup email for a new or existing employee."""
    import urllib.parse
    clean_token = token.strip()
    clean_email = to_email.strip()
    quoted_token = urllib.parse.quote(clean_token)
    quoted_email = urllib.parse.quote(clean_email)
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip("/")
    setup_url = f"{base_url}/setup-employee?token={quoted_token}&email={quoted_email}"
    sent_time = datetime.utcnow().strftime("%b %d, %H:%M UTC")
    subject = "HR Portal - Welcome to the Team!"

    text_body = f"""Hello {employee_name},

An administrator has invited you to join the HR & Employee Management Portal.

Please use the secure link below to set up your account password and get started:
{setup_url}

This invitation link expires in 48 hours. If you received multiple invitation emails, please use the link in the newest email.
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0F19; color: #F1F5F9; margin: 0; padding: 20px; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #111827; border: 1px solid #1F2937; border-radius: 12px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }}
    .brand {{ display: inline-block; background: linear-gradient(135deg, #6366F1, #06B6D4); color: white; font-weight: 800; font-size: 1.1rem; padding: 6px 14px; border-radius: 8px; margin-bottom: 20px; }}
    h1 {{ font-size: 1.4rem; color: #FFFFFF; margin: 0 0 12px; }}
    p {{ font-size: 0.95rem; line-height: 1.6; color: #94A3B8; margin: 0 0 20px; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #6366F1, #4F46E5); color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 20px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }}
    .footer {{ font-size: 0.8rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 24px; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">HR & Employee Management Portal</div>
    <h1>Welcome to the Team!</h1>
    <p>Hi <strong>{employee_name}</strong>,</p>
    <p>An administrator has invited you to access your employee account on the HR & Employee Management Portal. Click the button below to set your password and complete your account setup:</p>
    
    <div style="text-align: center;">
      <a href="{setup_url}" class="btn">Set Up My Account Password</a>
    </div>

    <div class="footer">
      Generated on {sent_time} (expires in 48 hours).<br>
      If you received multiple invitation emails, please use the link in the newest email.
    </div>
  </div>
</body>
</html>"""

    _send_mime_message(to_email, subject, html_body, text_body)
