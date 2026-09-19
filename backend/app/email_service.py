import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

class EmailDeliveryError(Exception):
    """Custom exception raised when email sending fails."""
    pass

def is_smtp_configured() -> bool:
    """Checks if real SMTP credentials have been provided."""
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD and settings.SMTP_HOST)

def is_email_service_configured() -> bool:
    """Checks if SMTP credentials have been configured."""
    return is_smtp_configured()

def _send_mime_message(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Sends a multipart email through the configured SMTP server."""
    if is_smtp_configured():
        from_email = settings.SMTP_FROM_EMAIL.strip() if settings.SMTP_FROM_EMAIL.strip() else settings.SMTP_USER.strip()
        from_name = settings.SMTP_FROM_NAME.strip() if settings.SMTP_FROM_NAME.strip() else "HR & Employee Management Portal"
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

        # Try the configured provider port first, then the alternate secure port.
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
                print(f"✅ [SMTP] Email successfully delivered to {to_email} via port {port}")
                return
            except smtplib.SMTPAuthenticationError as auth_err:
                print(f"❌ [SMTP] Authentication Failed: {auth_err}")
                delivery_error = auth_err
                break
            except Exception as exc:
                print(f"⚠️ [SMTP] Connection on port {port} failed: {exc}")
                delivery_error = exc

        raise EmailDeliveryError(f"Email delivery failed via SMTP (tried ports {ports_to_try}): {str(delivery_error)}")

    # 3. Clean console dispatch & actionable configuration error
    print("\n" + "=" * 65)
    print(f"📧 [EMAIL SERVICE - LOCAL CONSOLE DISPATCH]")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print("-" * 65)
    print(text_body)
    print("=" * 65 + "\n")
    raise EmailDeliveryError(
        "Email delivery service is not configured (SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are missing in .env). "
        "Configure the SMTP credentials supplied by your email provider to send real emails."
    )

def send_verification_email(to_email: str, user_name: str, code: str, frontend_url: str = None) -> None:
    """Sends an account email verification email with a prominent 6-digit code and direct 1-click link."""
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip('/')
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
    .code-container {{ text-align: center; margin: 26px 0 20px; }}
    .code-label {{ font-size: 0.8rem; color: #94A3B8; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; margin-bottom: 8px; }}
    .code-box {{ display: inline-block; background: rgba(99, 102, 241, 0.12); border: 2px solid rgba(99, 102, 241, 0.4); border-radius: 12px; padding: 14px 28px; font-size: 2.2rem; font-weight: 800; letter-spacing: 10px; font-family: 'Courier New', monospace; color: #A5B4FC; text-shadow: 0 0 16px rgba(99, 102, 241, 0.3); }}
    .btn {{ display: inline-block; background: #6366F1; color: #FFFFFF !important; font-weight: 700; font-size: 0.95rem; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 10px 0 24px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }}
    .footer {{ font-size: 0.75rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">HR & Employee Management Portal</div>
    <h1>Verify your email address</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>Welcome to HR & Employee Management Portal! Enter the 6-digit verification code below to activate and secure your account:</p>
    
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
      If you did not sign up for HR & Employee Management Portal, please disregard this email.
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
    subject = "Reset Your Password - HR & Employee Management Portal"

    text_body = f"""Hello {user_name},

We received a request to reset your HR & Employee Management Portal account password.

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
    <div class="brand">HR & Employee Management Portal</div>
    <h1>Password Reset Request</h1>
    <p>Hi <strong>{user_name}</strong>,</p>
    <p>We received a request to reset the password for your HR & Employee Management Portal account. Click the button below to choose a new strong password:</p>
    
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


def send_employee_setup_email(to_email: str, employee_name: str, token: str, frontend_url: str = None) -> None:
    """Sends a secure first-time login setup email for a new or existing employee with unthreaded distinct subject."""
    import urllib.parse
    clean_token = token.strip()
    clean_email = to_email.strip()
    quoted_token = urllib.parse.quote(clean_token)
    quoted_email = urllib.parse.quote(clean_email)
    base_url = (frontend_url or settings.FRONTEND_URL or "http://localhost:3000").strip().rstrip('/')
    setup_url = f"{base_url}/setup-employee?token={quoted_token}&email={quoted_email}"
    inv_code = clean_token[:8].upper()
    sent_time = datetime.utcnow().strftime('%b %d, %H:%M UTC')
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
    .link-text {{ font-size: 0.8rem; color: #6366F1; word-break: break-all; text-decoration: underline; }}
    .footer {{ font-size: 0.75rem; color: #64748B; border-top: 1px solid #1F2937; padding-top: 16px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">HR & Employee Management Portal</div>
    <h1>Welcome to the Team!</h1>
    <p>Hi <strong>{employee_name}</strong>,</p>
    <p>An administrator has invited you to access your employee account on the HR & Employee Management Portal. Click the button below to set your password and complete your account setup:</p>
    
    <div style="text-align: center;">
      <a href="{setup_url}" class="btn" target="_blank">Set Up My Account</a>
    </div>

    <p style="font-size: 0.82rem; margin-bottom: 8px;">Or copy and paste this link into your browser:</p>
    <p><a href="{setup_url}" class="link-text">{setup_url}</a></p>

    <div class="footer">
      Generated on {sent_time} (expires in 48 hours).<br>
      If you received multiple invitation emails, please use the link in the newest email.
    </div>
  </div>
</body>
</html>
"""
    _send_mime_message(to_email, subject, html_body, text_body)



