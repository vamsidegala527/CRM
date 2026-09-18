from unittest.mock import Mock, patch

import pytest

from app import email_service


def test_smtp_uses_configured_provider_port(monkeypatch):
    monkeypatch.setattr(email_service.settings, "SMTP_USER", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "SMTP_PASSWORD", "password")
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.provider.example")
    monkeypatch.setattr(email_service.settings, "SMTP_PORT", 2525)

    smtp = Mock()
    with patch.object(email_service.smtplib, "SMTP", return_value=smtp) as smtp_factory:
        email_service._send_mime_message("employee@example.com", "Subject", "html", "text")

    smtp_factory.assert_called_once_with("smtp.provider.example", 2525, timeout=10)
    smtp.login.assert_called_once_with("sender@example.com", "password")


def test_missing_email_provider_raises_delivery_error(monkeypatch):
    monkeypatch.setattr(email_service.settings, "SMTP_USER", "")
    monkeypatch.setattr(email_service.settings, "SMTP_PASSWORD", "")

    with pytest.raises(email_service.EmailDeliveryError, match="not configured"):
        email_service._send_mime_message("employee@example.com", "Subject", "html", "text")