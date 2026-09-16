import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

class EmailDeliveryError(Exception):
    """Custom exception raised when email sending fails."""
    pass

def is_smtp_configured() -> bool:
    """Checks if real SMTP credentials have been provided."""
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD and settings.SMTP_HOST)

def _send_mime_message(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Sends a multipart MIME email via SMTP or logs to console if unconfigured."""
    from_address = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_address
    msg["To"] = to_email

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if not is_smtp_configured():
        # Clean local development & fallback logger
        print("\n" + "=" * 65)
        print(f"📧 [EMAIL SERVICE - LOCAL CONSOLE DISPATCH]")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print("-" * 65)
        print(text_body)
        print("=" * 65 + "\n")
        return

    try:
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12)
            if settings.SMTP_TLS:
                server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
        server.quit()
        print(f"✅ [EMAIL SERVICE] Email successfully dispatched to {to_email}")
    except smtplib.SMTPAuthenticationError as auth_err:
        print(f"❌ [EMAIL SERVICE] SMTP Authentication Failed: {auth_err}")
        raise EmailDeliveryError("Authentication with the email server failed. Please check SMTP credentials.")
    except Exception as exc:
        print(f"❌ [EMAIL SERVICE] Failed to deliver email to {to_email}: {exc}")
        raise EmailDeliveryError(f"Email delivery failed: {str(exc)}")

def send_verification_email(to_email: str, user_name: str, token: str) -> None:
    """Sends an account email verification email with a direct clickable link and token."""
    verify_url = f"{settings.FRONTEND_URL}/login?verify_token={token}"
    subject = "Verify Your Email Address - Customer Hub"

    text_body = f"""Hello {user_name},

Thank you for registering with Customer Hub.

Please verify your email address to activate your account features.

Verification Link:
{verify_url}

Your Verification Token:
{token}

This token will expire in 24 hours. If you did not create an account, you can safely ignore this message.
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
    .btn {{ display: inline-block; background: #6366F1; color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 24px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }}
    .token-box {{ background: rgba(255, 255, 255, 0.04); border: 1px dashed #374151; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 0.85rem; color: #C7D2FE; word-break: break-all; margin-bottom: 20px; }}
    .footer {{ font-size: 0.75rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Customer Hub</div>
    <h1>Verify your email address</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>Welcome to Customer Hub! Please confirm your email address to complete your registration and secure your account.</p>
    
    <div style="text-align: center;">
      <a href="{verify_url}" class="btn" target="_blank">Verify Email Address</a>
    </div>

    <p style="font-size: 0.85rem; margin-bottom: 8px;">Or copy and paste this verification code into the application:</p>
    <div class="token-box">{token}</div>

    <div class="footer">
      This link and verification token expire in 24 hours.<br>
      If you did not sign up for Customer Hub, please disregard this email.
    </div>
  </div>
</body>
</html>
"""

    _send_mime_message(to_email, subject, html_body, text_body)

def send_password_reset_email(to_email: str, user_name: str, token: str) -> None:
    """Sends a password reset email with a direct clickable reset link and token."""
    reset_url = f"{settings.FRONTEND_URL}/login?reset_token={token}&email={to_email}"
    subject = "Reset Your Password - Customer Hub"

    text_body = f"""Hello {user_name},

We received a request to reset your Customer Hub account password.

To set a new password, click the link below:
{reset_url}

Your Reset Token:
{token}

This reset token expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
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
    .btn {{ display: inline-block; background: #EF4444; color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 24px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); }}
    .token-box {{ background: rgba(255, 255, 255, 0.04); border: 1px dashed #374151; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 0.85rem; color: #FCA5A5; word-break: break-all; margin-bottom: 20px; }}
    .footer {{ font-size: 0.75rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Customer Hub</div>
    <h1>Password Reset Request</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>We received a request to reset the password for your Customer Hub account. Click the button below to choose a new strong password.</p>
    
    <div style="text-align: center;">
      <a href="{reset_url}" class="btn" target="_blank">Reset Password</a>
    </div>

    <p style="font-size: 0.85rem; margin-bottom: 8px;">Or copy and paste your reset token manually:</p>
    <div class="token-box">{token}</div>

    <div class="footer">
      This password reset token expires in 1 hour.<br>
      If you did not request this change, please ignore this email or contact support immediately.
    </div>
  </div>
</body>
</html>
"""

    _send_mime_message(to_email, subject, html_body, text_body)
