/**
 * Centralized RFC-Compliant Email Validation & Sanitization Utility
 * 
 * Features:
 * - RFC 5321 length limits (max 254 chars overall, max 64 chars local part)
 * - Strict syntax & format validation (no consecutive dots, proper labels, valid TLD)
 * - RFC 2606 & RFC 6761 reserved domain rejection (example.com, example.net, example.org, .test, .example, .invalid, .localhost)
 * - Disposable / throwaway / placeholder domain rejection (mailinator.com, tempmail.com, test.com, sample.com, etc.)
 * - Standardized output contract and user-facing error message
 */

import { z } from 'zod';

export type EmailValidationReason = 'INVALID_FORMAT' | 'RESERVED_DOMAIN' | 'DISPOSABLE_DOMAIN';

export interface EmailValidationResult {
  isValid: boolean;
  reason?: EmailValidationReason;
  sanitizedEmail: string;
  errorMessage?: string;
}

export const EMAIL_ERROR_MESSAGE = 'Please provide a valid email address';

// RFC 2606 and RFC 6761 reserved domains
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.edu',
  'localhost',
]);

// Reserved Top-Level Domains (TLDs)
const RESERVED_TLDS = new Set([
  'test',
  'example',
  'invalid',
  'localhost',
]);

// Common throwaway, disposable, and placeholder domains
const DISPOSABLE_OR_PLACEHOLDER_DOMAINS = new Set([
  'test.com',
  'sample.com',
  'demo.com',
  'fake.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'throwawaymail.com',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'trashmail.com',
  'getairmail.com',
  'fakemailgenerator.com',
  'mytemp.email',
  'burnermail.io',
]);

// RFC compliant local-part regex (quoted strings not encouraged for modern web apps)
const LOCAL_PART_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;

// Domain label regex (alphanumeric, may contain interior hyphens)
const DOMAIN_LABEL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

/**
 * Sanitizes an email string by trimming leading/trailing whitespace
 * and lowercasing the domain portion (and full email for consistent storage).
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) {
    return trimmed.toLowerCase();
  }
  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1).toLowerCase();
  return `${localPart}@${domainPart}`;
}

/**
 * Validates an email address against RFC length, syntax, and domain restrictions.
 */
export function validateEmail(email: string | null | undefined): EmailValidationResult {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: '',
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: '',
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // RFC 5321 length limits
  if (trimmed.length > 254) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: trimmed,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Must contain exactly one '@'
  const atParts = trimmed.split('@');
  if (atParts.length !== 2) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: trimmed,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  const [localPart, rawDomainPart] = atParts;
  const domainPart = rawDomainPart.toLowerCase();
  const sanitized = `${localPart}@${domainPart}`;

  // Local part constraints: max 64 chars, not empty
  if (!localPart || localPart.length > 64) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Local part syntax
  if (!LOCAL_PART_REGEX.test(localPart)) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Domain part constraints: max 253 chars, not empty
  if (!domainPart || domainPart.length > 253) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Domain labels check
  const domainLabels = domainPart.split('.');

  // Check for standalone localhost or single-label domain
  if (domainLabels.length < 2) {
    // If it's localhost or an invalid single label
    if (domainPart === 'localhost') {
      return {
        isValid: false,
        reason: 'RESERVED_DOMAIN',
        sanitizedEmail: sanitized,
        errorMessage: EMAIL_ERROR_MESSAGE,
      };
    }
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Check each domain label
  for (const label of domainLabels) {
    if (!label || label.length > 63 || !DOMAIN_LABEL_REGEX.test(label)) {
      return {
        isValid: false,
        reason: 'INVALID_FORMAT',
        sanitizedEmail: sanitized,
        errorMessage: EMAIL_ERROR_MESSAGE,
      };
    }
  }

  // Top-Level Domain (TLD) checks: last label must be at least 2 alphabetic characters
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) {
    return {
      isValid: false,
      reason: 'INVALID_FORMAT',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Reserved TLD check (.test, .example, .invalid, .localhost)
  if (RESERVED_TLDS.has(tld)) {
    return {
      isValid: false,
      reason: 'RESERVED_DOMAIN',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Reserved Domain & Subdomain check (example.com, *.example.com, etc.)
  if (RESERVED_DOMAINS.has(domainPart)) {
    return {
      isValid: false,
      reason: 'RESERVED_DOMAIN',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  if (Array.from(RESERVED_DOMAINS).some((r) => domainPart.endsWith(`.${r}`))) {
    return {
      isValid: false,
      reason: 'RESERVED_DOMAIN',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  // Disposable / Throwaway / Placeholder Domain check
  if (DISPOSABLE_OR_PLACEHOLDER_DOMAINS.has(domainPart)) {
    return {
      isValid: false,
      reason: 'DISPOSABLE_DOMAIN',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  if (Array.from(DISPOSABLE_OR_PLACEHOLDER_DOMAINS).some((d) => domainPart.endsWith(`.${d}`))) {
    return {
      isValid: false,
      reason: 'DISPOSABLE_DOMAIN',
      sanitizedEmail: sanitized,
      errorMessage: EMAIL_ERROR_MESSAGE,
    };
  }

  return {
    isValid: true,
    sanitizedEmail: sanitized,
  };
}

/**
 * Returns true if the email is strictly valid according to RFC and domain rules.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  return validateEmail(email).isValid;
}

/**
 * Reusable Zod schema refinement for validating email inputs.
 */
export const emailZodSchema = z
  .string()
  .trim()
  .min(1, 'Email cannot be empty')
  .refine((val) => isValidEmail(val), {
    message: EMAIL_ERROR_MESSAGE,
  });
