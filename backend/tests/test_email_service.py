from unittest.mock import Mock, patch
import pytest
from app import email_service


def test_brevo_sends_via_https_api(monkeypatch):
    monkeypatch.setattr(email_service.settings, "BREVO_API_KEY", "xkeysib-test-12345")
    monkeypatch.setattr(email_service.settings, "BREVO_SENDER_EMAIL", "admin@example.com")
    monkeypatch.setattr(email_service.settings, "BREVO_SENDER_NAME", "Test Portal")

    mock_resp = Mock()
    mock_resp.status = 201
    mock_resp.__enter__ = Mock(return_value=mock_resp)
    mock_resp.__exit__ = Mock(return_value=False)

    with patch.object(email_service.urllib.request, "urlopen", return_value=mock_resp) as mock_urlopen:
        email_service._send_mime_message("user@example.com", "Test Subject", "<p>Hello</p>", "Hello")

    mock_urlopen.assert_called_once()
    req = mock_urlopen.call_args[0][0]
    assert req.full_url == "https://api.brevo.com/v3/smtp/email"
    assert req.headers.get("Api-key") == "xkeysib-test-12345"


def test_missing_brevo_key_raises_delivery_error(monkeypatch):
    monkeypatch.setattr(email_service.settings, "BREVO_API_KEY", "")

    with pytest.raises(email_service.EmailDeliveryError, match="not configured"):
        email_service._send_mime_message("user@example.com", "Subject", "<p>html</p>", "text")