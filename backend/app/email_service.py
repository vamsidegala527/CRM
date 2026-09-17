import os
import json
import urllib.request
import urllib.error
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

class EmailDeliveryError(Exception):
    """Custom exception raised when email sending fails."""
    pass

def get_resend_api_key() -> str:
    key = (getattr(settings, "RESEND_API_KEY", "") or "").strip()
    if not key or key in ("re_your_actual_key_here", "re_secret_in_production"):
        key = (os.getenv("RESEND_API_KEY") or "").strip()
    return key

def is_resend_configured() -> bool:
    """Checks if Resend API key is configured."""
    return bool(get_resend_api_key())

def is_smtp_configured() -> bool:
    """Checks if real SMTP credentials have been provided."""
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD and settings.SMTP_HOST)

def is_email_service_configured() -> bool:
    """Checks if either Resend API or SMTP credentials are configured."""
    return is_resend_configured() or is_smtp_configured()

def _send_via_resend(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Delivers email via Resend's secure HTTPS REST API."""
    api_url = "https://api.resend.com/emails"
    from_email = settings.SMTP_FROM_EMAIL.strip() if settings.SMTP_FROM_EMAIL.strip() else "onboarding@resend.dev"
    if "@" not in from_email or from_email.endswith("@localhost") or "customerhub.com" in from_email or from_email.endswith("@gmail.com") or from_email.endswith("@yahoo.com") or from_email.endswith("@outlook.com"):
        from_email = "onboarding@resend.dev"
    from_address = f"{settings.SMTP_FROM_NAME} <{from_email}>"

    payload = {
        "from": from_address,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body
    }

    resend_key = get_resend_api_key()
    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
            "User-Agent": "CustomerHub/1.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            print(f"✅ [RESEND] Email successfully delivered to {to_email} (ID: {res_data.get('id')})")
    except urllib.error.HTTPError as http_err:
        err_body = http_err.read().decode("utf-8")
        print(f"❌ [RESEND] Delivery error {http_err.code}: {err_body}")
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("message", err_body)
        except Exception:
            msg = err_body
        
        if "only send testing emails to your own email address" in msg:
            print("\n" + "=" * 65)
            print(f"⚠️ [RESEND SANDBOX MODE NOTICE]")
            print(f"Recipient: {to_email}")
            print(f"Resend free tier only sends emails to your registered account email (vamsidegala527@gmail.com).")
            print(f"To test with other email addresses, verify your domain at https://resend.com/domains.")
            print("-" * 65)
            print(f"LOCAL CONSOLE LINK FOR RECIPIENT ({to_email}):")
            print(text_body)
            print("=" * 65 + "\n")
            raise EmailDeliveryError(
                "Resend is currently in Sandbox Mode: It can only deliver emails to your registered Resend account email (vamsidegala527@gmail.com). "
                "To test real email delivery, please use 'vamsidegala527@gmail.com', or verify a custom domain at resend.com/domains."
            )

        raise EmailDeliveryError(f"Resend error: {msg}")
    except Exception as exc:
        print(f"❌ [RESEND] Failed to deliver: {exc}")
        raise EmailDeliveryError(f"Resend delivery failed: {str(exc)}")

def _send_mime_message(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Sends a multipart email via Gmail SMTP or fallback Resend API with bidirectional cloud fallback."""
    is_render = (
        os.getenv("RENDER", "").lower() == "true" or
        os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")
    )

    # 1. On Render cloud free tier, outbound SMTP ports (25, 465, 587) are firewalled.
    # Prefer Resend HTTPS REST API (port 443) which delivers instantly over HTTPS.
    if is_render and is_resend_configured():
        try:
            _send_via_resend(to_email, subject, html_body, text_body)
            return
        except Exception as resend_err:
            print(f"⚠️ [RESEND] Primary delivery failed: {resend_err}. Attempting SMTP fallback...")

    # 2. Try Gmail SMTP if configured
    if is_smtp_configured():
        from_email = settings.SMTP_FROM_EMAIL.strip() if settings.SMTP_FROM_EMAIL.strip() else settings.SMTP_USER.strip()
        from_name = settings.SMTP_FROM_NAME.strip() if settings.SMTP_FROM_NAME.strip() else "Customer Hub"
        from_address = f"{from_name} <{from_email}>"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_address
        msg["To"] = to_email

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        clean_password = settings.SMTP_PASSWORD.replace(" ", "").strip()
        smtp_host = settings.SMTP_HOST.strip() or "smtp.gmail.com"
        smtp_user = settings.SMTP_USER.strip()

        # Dual-port resilience: try configured port, then fallback port (465 SSL or 587 STARTTLS)
        ports_to_try = [settings.SMTP_PORT]
        alt_port = 465 if settings.SMTP_PORT != 465 else 587
        if alt_port not in ports_to_try:
            ports_to_try.append(alt_port)

        delivery_error = None
        for port in ports_to_try:
            try:
                if port == 465:
                    server = smtplib.SMTP_SSL(smtp_host, port, timeout=10)
                    server.ehlo()
                else:
                    server = smtplib.SMTP(smtp_host, port, timeout=10)
                    server.ehlo()
                    if settings.SMTP_TLS:
                        server.starttls()
                        server.ehlo()

                server.login(smtp_user, clean_password)
                server.sendmail(from_email, [to_email], msg.as_string())
                server.quit()
                print(f"✅ [GMAIL SMTP] Email successfully delivered to {to_email} via port {port}")
                return
            except smtplib.SMTPAuthenticationError as auth_err:
                print(f"❌ [GMAIL SMTP] Authentication Failed: {auth_err}")
                delivery_error = auth_err
                break
            except Exception as exc:
                print(f"⚠️ [GMAIL SMTP] Connection on port {port} failed: {exc}")
                delivery_error = exc

        # If SMTP fails on all ports, fall back to Resend HTTPS API before raising an error
        if is_resend_configured():
            print(f"⚠️ [SMTP] Delivery failed on ports {ports_to_try} ({delivery_error}). Attempting Resend HTTPS fallback...")
            try:
                _send_via_resend(to_email, subject, html_body, text_body)
                return
            except Exception as resend_err:
                print(f"❌ [RESEND] Fallback also failed: {resend_err}")
                raise EmailDeliveryError(f"Email delivery failed (SMTP: {delivery_error}; Resend: {resend_err})")

        raise EmailDeliveryError(f"Email delivery failed via SMTP (tried ports {ports_to_try}): {str(delivery_error)}")

    # 3. Resend HTTPS API if SMTP was not configured
    if is_resend_configured():
        _send_via_resend(to_email, subject, html_body, text_body)
        return

    # 3. Clean console dispatch & actionable configuration error
    print("\n" + "=" * 65)
    print(f"📧 [EMAIL SERVICE - LOCAL CONSOLE DISPATCH]")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print("-" * 65)
    print(text_body)
    print("=" * 65 + "\n")
    raise EmailDeliveryError(
        "Email delivery service is not configured (SMTP_USER and SMTP_PASSWORD are missing in .env). "
        "Please add your 16-character Gmail App Password to send real emails to any inbox."
    )

def send_verification_email(to_email: str, user_name: str, code: str, frontend_url: str = None) -> None:
    """Sends an account email verification email with a prominent 6-digit code and direct 1-click link."""
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip('/')
    verify_url = f"{base_url}/verify-email?code={code}&email={to_email}"
    subject = f"{code} is your Customer Hub verification code"

    text_body = f"""Hello {user_name},

Thank you for registering with Customer Hub.

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
    .code-container {{ text-align: center; margin: 26px 0 20px; }}
    .code-label {{ font-size: 0.8rem; color: #94A3B8; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; margin-bottom: 8px; }}
    .code-box {{ display: inline-block; background: rgba(99, 102, 241, 0.12); border: 2px solid rgba(99, 102, 241, 0.4); border-radius: 12px; padding: 14px 28px; font-size: 2.2rem; font-weight: 800; letter-spacing: 10px; font-family: 'Courier New', monospace; color: #A5B4FC; text-shadow: 0 0 16px rgba(99, 102, 241, 0.3); }}
    .btn {{ display: inline-block; background: #6366F1; color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 24px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }}
    .footer {{ font-size: 0.75rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Customer Hub</div>
    <h1>Verify your email address</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>Welcome to Customer Hub! Enter the 6-digit verification code below to activate and secure your account:</p>
    
    <div class="code-container">
      <div class="code-label">Verification Code</div>
      <div class="code-box">{code}</div>
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 12px;">Or click the button below to verify automatically:</p>
      <a href="{verify_url}" class="btn" target="_blank">Verify Email Automatically</a>
    </div>

    <div class="footer">
      This code expires in 24 hours.<br>
      If you did not sign up for Customer Hub, please disregard this email.
    </div>
  </div>
</body>
</html>
"""

    _send_mime_message(to_email, subject, html_body, text_body)

def send_password_reset_email(to_email: str, user_name: str, token: str, frontend_url: str = None) -> None:
    """Sends a password reset email with a direct clickable reset link."""
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip('/')
    reset_url = f"{base_url}/reset-password?token={token}&email={to_email}"
    subject = "Reset Your Password - Customer Hub"

    text_body = f"""Hello {user_name},

We received a request to reset your Customer Hub account password.

To set a new password, click the link below:
{reset_url}

This password-reset link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
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
    .btn {{ display: inline-block; background: #EF4444; color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 20px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); }}
    .link-text {{ font-size: 0.8rem; color: #6366F1; word-break: break-all; text-decoration: underline; }}
    .footer {{ font-size: 0.75rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Customer Hub</div>
    <h1>Password Reset Request</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>We received a request to reset the password for your Customer Hub account. Click the button below to choose a new strong password:</p>
    
    <div style="text-align: center;">
      <a href="{reset_url}" class="btn" target="_blank">Reset Password</a>
    </div>

    <p style="font-size: 0.82rem; margin-bottom: 8px;">Or copy and paste this link into your browser:</p>
    <p><a href="{reset_url}" class="link-text">{reset_url}</a></p>

    <div class="footer">
      This password reset link expires in 1 hour.<br>
      If you did not request this change, please ignore this email or contact support immediately.
    </div>
  </div>
</body>
</html>
"""

    _send_mime_message(to_email, subject, html_body, text_body)

