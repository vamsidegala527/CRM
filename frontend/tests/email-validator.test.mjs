/**
 * Automated Unit Test Suite for Centralized Email Validator
 * 
 * Verifies:
 * 1. Valid emails (standard, multiple subdomains, plus addressing, UK domains)
 * 2. Syntax violations (missing @, consecutive dots, invalid TLDs, length limits)
 * 3. Reserved domains per RFC 2606 & RFC 6761 (example.com, .test, .example, .invalid, .localhost)
 * 4. Disposable and placeholder domains (test.com, sample.com, mailinator.com, tempmail.com, etc.)
 * 5. Sanitization & output contract consistency
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Dynamically import compiled TypeScript or test the validator logic directly
import {
  validateEmail,
  isValidEmail,
  sanitizeEmail,
  EMAIL_ERROR_MESSAGE,
} from '../src/lib/validators/emailValidator.ts';

describe('Centralized Email Validator - Unit Tests', () => {

  describe('1. Valid Emails', () => {
    it('accepts standard corporate and personal emails', () => {
      const validCases = [
        'user@company.com',
        'name.surname@domain.co.uk',
        'employee123@enterprise.org',
        'firstname-lastname@my-domain.org',
        'sales+tag@startup.io',
        'first.middle.last@global.corp.net',
      ];

      for (const email of validCases) {
        const result = validateEmail(email);
        assert.equal(result.isValid, true, `Expected "${email}" to be valid`);
        assert.equal(isValidEmail(email), true);
        assert.equal(result.errorMessage, undefined);
      }
    });

    it('sanitizes leading and trailing whitespace', () => {
      const input = '   alex.chen@company.com   ';
      const result = validateEmail(input);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitizedEmail, 'alex.chen@company.com');
      assert.equal(sanitizeEmail(input), 'alex.chen@company.com');
    });

    it('normalizes domain part to lowercase', () => {
      const input = 'User.Name@COMPANY.COM';
      const result = validateEmail(input);
      assert.equal(result.isValid, true);
      assert.equal(result.sanitizedEmail, 'User.Name@company.com');
      assert.equal(sanitizeEmail(input), 'User.Name@company.com');
    });
  });

  describe('2. Syntax Violations', () => {
    it('rejects null, undefined, and empty string', () => {
      assert.equal(validateEmail(null).isValid, false);
      assert.equal(validateEmail(undefined).isValid, false);
      assert.equal(validateEmail('').isValid, false);
      assert.equal(validateEmail('   ').isValid, false);
      assert.equal(validateEmail('').reason, 'INVALID_FORMAT');
      assert.equal(validateEmail('').errorMessage, EMAIL_ERROR_MESSAGE);
    });

    it('rejects emails missing the "@" symbol', () => {
      const result = validateEmail('usercompany.com');
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'INVALID_FORMAT');
      assert.equal(result.errorMessage, EMAIL_ERROR_MESSAGE);
    });

    it('rejects emails with multiple "@" symbols', () => {
      const result = validateEmail('user@domain@company.com');
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'INVALID_FORMAT');
    });

    it('rejects missing local part or missing domain', () => {
      assert.equal(validateEmail('@company.com').isValid, false);
      assert.equal(validateEmail('user@').isValid, false);
    });

    it('rejects consecutive dots in local part', () => {
      const result = validateEmail('user..name@company.com');
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'INVALID_FORMAT');
    });

    it('rejects leading or trailing dots in local part', () => {
      assert.equal(validateEmail('.username@company.com').isValid, false);
      assert.equal(validateEmail('username.@company.com').isValid, false);
    });

    it('rejects local part exceeding 64 characters (RFC 5321)', () => {
      const longLocal = 'a'.repeat(65) + '@company.com';
      const result = validateEmail(longLocal);
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'INVALID_FORMAT');
    });

    it('rejects total length exceeding 254 characters (RFC 5321)', () => {
      const longEmail = 'user@' + 'a'.repeat(245) + '.com';
      const result = validateEmail(longEmail);
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'INVALID_FORMAT');
    });

    it('rejects invalid domain formats and single-letter/numeric TLDs', () => {
      assert.equal(validateEmail('user@company').isValid, false);
      assert.equal(validateEmail('user@company.c').isValid, false);
      assert.equal(validateEmail('user@company.123').isValid, false);
      assert.equal(validateEmail('user@-company.com').isValid, false);
      assert.equal(validateEmail('user@company-.com').isValid, false);
    });
  });

  describe('3. Reserved Domains per RFC 2606 & RFC 6761', () => {
    it('rejects RFC 2606 reserved second-level domains', () => {
      const reservedCases = [
        'hari@example.com',
        'admin@example.net',
        'ceo@example.org',
        'info@example.edu',
      ];

      for (const email of reservedCases) {
        const result = validateEmail(email);
        assert.equal(result.isValid, false, `Expected "${email}" to be rejected`);
        assert.equal(result.reason, 'RESERVED_DOMAIN');
        assert.equal(result.errorMessage, EMAIL_ERROR_MESSAGE);
      }
    });

    it('rejects subdomains of reserved domains', () => {
      const subdomains = [
        'user@sub.example.net',
        'admin@corp.example.com',
        'test@dept.internal.example.org',
      ];

      for (const email of subdomains) {
        const result = validateEmail(email);
        assert.equal(result.isValid, false, `Expected "${email}" to be rejected`);
        assert.equal(result.reason, 'RESERVED_DOMAIN');
        assert.equal(result.errorMessage, EMAIL_ERROR_MESSAGE);
      }
    });

    it('rejects reserved TLDs (.test, .example, .invalid, .localhost) and localhost hostname', () => {
      const reservedTlds = [
        'admin@localhost',
        'user@domain.test',
        'user@company.example',
        'user@system.invalid',
        'user@host.localhost',
      ];

      for (const email of reservedTlds) {
        const result = validateEmail(email);
        assert.equal(result.isValid, false, `Expected "${email}" to be rejected`);
        assert.equal(result.reason, 'RESERVED_DOMAIN');
        assert.equal(result.errorMessage, EMAIL_ERROR_MESSAGE);
      }
    });
  });

  describe('4. Placeholder and Disposable Domains', () => {
    it('rejects common placeholder/dummy domains', () => {
      const placeholders = [
        'test@test.com',
        'user@sample.com',
        'demo@demo.com',
        'fake@fake.com',
      ];

      for (const email of placeholders) {
        const result = validateEmail(email);
        assert.equal(result.isValid, false, `Expected "${email}" to be rejected`);
        assert.equal(result.reason, 'DISPOSABLE_DOMAIN');
        assert.equal(result.errorMessage, EMAIL_ERROR_MESSAGE);
      }
    });

    it('rejects common disposable/throwaway mail services', () => {
      const disposables = [
        'user@mailinator.com',
        'temp@tempmail.com',
        'throwaway@10minutemail.com',
        'burner@guerrillamail.com',
        'fake@throwawaymail.com',
        'anon@yopmail.com',
        'junk@sharklasers.com',
        'trash@trashmail.com',
        'user@dispostable.com',
        'sub@temp-mail.org',
        'client@sub.mailinator.com',
      ];

      for (const email of disposables) {
        const result = validateEmail(email);
        assert.equal(result.isValid, false, `Expected "${email}" to be rejected`);
        assert.equal(result.reason, 'DISPOSABLE_DOMAIN');
        assert.equal(result.errorMessage, EMAIL_ERROR_MESSAGE);
      }
    });
  });

  describe('5. Output Contract & Error Message', () => {
    it('guarantees standardized error message and contract fields', () => {
      const invalid = validateEmail('invalid-input');
      assert.equal(invalid.isValid, false);
      assert.equal(invalid.errorMessage, 'Please provide a valid email address');
      assert.equal(typeof invalid.sanitizedEmail, 'string');
      assert.equal(typeof invalid.reason, 'string');

      const valid = validateEmail('valid.user@company.com');
      assert.equal(valid.isValid, true);
      assert.equal(valid.errorMessage, undefined);
      assert.equal(valid.reason, undefined);
      assert.equal(valid.sanitizedEmail, 'valid.user@company.com');
    });
  });

});
