"""
Unit Test Suite for Centralized Backend Email Validator and Schema Integration
"""

import pytest
from pydantic import ValidationError
from app.validators import validate_email_strict, EMAIL_ERROR_MESSAGE
from app.schemas import EmployeeCreate, UserLogin, ForgotPasswordRequest


class TestEmailValidatorUnit:

    def test_valid_emails(self):
        valid_cases = [
            "user@company.com",
            "name.surname@domain.co.uk",
            "employee123@enterprise.org",
            "firstname-lastname@my-domain.org",
            "sales+tag@startup.io",
            "first.middle.last@global.corp.net",
        ]
        for email in valid_cases:
            result = validate_email_strict(email)
            assert result == email.lower(), f"Expected {email} to be valid"

    def test_sanitization_and_normalization(self):
        input_email = "   Alex.Chen@COMPANY.COM   "
        result = validate_email_strict(input_email)
        assert result == "Alex.Chen@company.com"

    def test_syntax_violations_raise_value_error(self):
        invalid_cases = [
            "",
            "   ",
            None,
            "usercompany.com",
            "user@domain@company.com",
            "@company.com",
            "user@",
            "user..name@company.com",
            ".username@company.com",
            "username.@company.com",
            "a" * 65 + "@company.com",
            "user@" + "a" * 245 + ".com",
            "user@company",
            "user@company.c",
            "user@company.123",
            "user@-company.com",
            "user@company-.com",
        ]
        for email in invalid_cases:
            with pytest.raises(ValueError, match=EMAIL_ERROR_MESSAGE):
                validate_email_strict(email)

    def test_rfc_reserved_domains_rejected(self):
        reserved_cases = [
            "hari@example.com",
            "admin@example.net",
            "ceo@example.org",
            "info@example.edu",
            "user@sub.example.net",
            "test@corp.example.com",
            "admin@localhost",
            "user@domain.test",
            "user@company.example",
            "user@system.invalid",
            "user@host.localhost",
        ]
        for email in reserved_cases:
            with pytest.raises(ValueError, match=EMAIL_ERROR_MESSAGE):
                validate_email_strict(email)

    def test_placeholder_and_disposable_domains_rejected(self):
        disposable_cases = [
            "test@test.com",
            "user@sample.com",
            "demo@demo.com",
            "fake@fake.com",
            "user@mailinator.com",
            "temp@tempmail.com",
            "throwaway@10minutemail.com",
            "burner@guerrillamail.com",
            "fake@throwawaymail.com",
            "anon@yopmail.com",
            "junk@sharklasers.com",
            "trash@trashmail.com",
            "user@dispostable.com",
            "sub@temp-mail.org",
            "client@sub.mailinator.com",
        ]
        for email in disposable_cases:
            with pytest.raises(ValueError, match=EMAIL_ERROR_MESSAGE):
                validate_email_strict(email)


class TestSchemaEmailIntegration:

    def test_employee_create_schema_valid_email(self):
        emp = EmployeeCreate(email="sarah.connor@company.com", full_name="Sarah Connor")
        assert emp.email == "sarah.connor@company.com"

    def test_employee_create_schema_rejects_reserved_domain(self):
        with pytest.raises(ValidationError) as exc:
            EmployeeCreate(email="sarah.connor@example.com", full_name="Sarah Connor")
        assert EMAIL_ERROR_MESSAGE in str(exc.value)

    def test_employee_create_schema_rejects_disposable_domain(self):
        with pytest.raises(ValidationError) as exc:
            EmployeeCreate(email="temp@mailinator.com", full_name="Temp User")
        assert EMAIL_ERROR_MESSAGE in str(exc.value)

    def test_user_login_schema_valid_and_invalid(self):
        login_valid = UserLogin(email="valid.admin@company.com", password="SecretPassword123!")
        assert login_valid.email == "valid.admin@company.com"

        with pytest.raises(ValidationError) as exc:
            UserLogin(email="bad@test.com", password="SecretPassword123!")
        assert EMAIL_ERROR_MESSAGE in str(exc.value)

    def test_forgot_password_schema_rejects_invalid_email(self):
        with pytest.raises(ValidationError) as exc:
            ForgotPasswordRequest(email="bademail")
        assert EMAIL_ERROR_MESSAGE in str(exc.value)
