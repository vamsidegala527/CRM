"""
Centralized RFC-Compliant Email Validation & Sanitization Module for FastAPI / Pydantic

Features:
- RFC 5321 length limits (max 254 chars overall, max 64 chars local part)
- Strict syntax and label checks (no consecutive dots, proper TLD)
- RFC 2606 & RFC 6761 reserved domain rejection (example.com, example.net, example.org, .test, .example, .invalid, .localhost)
- Disposable and placeholder domain rejection (mailinator.com, tempmail.com, test.com, sample.com, etc.)
- Raises ValueError("Please provide a valid email address") for all invalid inputs
"""

import re
from typing import Optional

EMAIL_ERROR_MESSAGE = "Please provide a valid email address"

RESERVED_DOMAINS = {
    "example.com",
    "example.net",
    "example.org",
    "example.edu",
    "localhost",
}

RESERVED_TLDS = {
    "test",
    "example",
    "invalid",
    "localhost",
}

DISPOSABLE_OR_PLACEHOLDER_DOMAINS = {
    "test.com",
    "sample.com",
    "demo.com",
    "fake.com",
    "mailinator.com",
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "guerrillamail.com",
    "guerrillamailblock.com",
    "throwawaymail.com",
    "yopmail.com",
    "sharklasers.com",
    "dispostable.com",
    "trashmail.com",
    "getairmail.com",
    "fakemailgenerator.com",
    "mytemp.email",
    "burnermail.io",
}

LOCAL_PART_REGEX = re.compile(
    r"^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$"
)
DOMAIN_LABEL_REGEX = re.compile(
    r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$"
)
TLD_REGEX = re.compile(r"^[a-zA-Z]{2,}$")


def validate_email_strict(v: Optional[str]) -> str:
    """
    Validates and sanitizes an email address according to RFC standards and domain policies.
    Returns normalized sanitized email string.
    Raises ValueError("Please provide a valid email address") on any violation.
    """
    if not v or not isinstance(v, str):
        raise ValueError(EMAIL_ERROR_MESSAGE)

    trimmed = v.strip()
    if not trimmed:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    # RFC 5321 length limits
    if len(trimmed) > 254:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    # Must contain exactly one '@'
    at_parts = trimmed.split("@")
    if len(at_parts) != 2:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    local_part, raw_domain = at_parts
    domain_part = raw_domain.lower()

    # Local part length & syntax
    if not local_part or len(local_part) > 64:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    if not LOCAL_PART_REGEX.match(local_part):
        raise ValueError(EMAIL_ERROR_MESSAGE)

    # Domain part length & structure
    if not domain_part or len(domain_part) > 253:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    domain_labels = domain_part.split(".")
    if len(domain_labels) < 2:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    for label in domain_labels:
        if not label or len(label) > 63 or not DOMAIN_LABEL_REGEX.match(label):
            raise ValueError(EMAIL_ERROR_MESSAGE)

    tld = domain_labels[-1]
    if not TLD_REGEX.match(tld):
        raise ValueError(EMAIL_ERROR_MESSAGE)

    # Reserved TLDs (.test, .example, .invalid, .localhost)
    if tld in RESERVED_TLDS:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    # Reserved Domains (example.com, example.net, etc.)
    if domain_part in RESERVED_DOMAINS:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    for reserved in RESERVED_DOMAINS:
        if domain_part.endswith(f".{reserved}"):
            raise ValueError(EMAIL_ERROR_MESSAGE)

    # Disposable or placeholder domains
    if domain_part in DISPOSABLE_OR_PLACEHOLDER_DOMAINS:
        raise ValueError(EMAIL_ERROR_MESSAGE)

    for disposable in DISPOSABLE_OR_PLACEHOLDER_DOMAINS:
        if domain_part.endswith(f".{disposable}"):
            raise ValueError(EMAIL_ERROR_MESSAGE)

    return f"{local_part}@{domain_part}"
