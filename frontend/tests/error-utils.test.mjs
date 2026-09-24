import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUserFriendlyError } from '../src/lib/errorUtils.ts';

test('formatUserFriendlyError Preserves Specific Sign-In Error Messages', async (t) => {
  await t.test('preserves unrecognized user 404 message', () => {
    const error = {
      status: 404,
      message: 'Your account was not found. Please contact company administrator to receive the account setup email.'
    };
    const res = formatUserFriendlyError(error);
    assert.equal(res, 'Your account was not found. Please contact company administrator to receive the account setup email.');
  });

  await t.test('preserves setup pending 403 message', () => {
    const error = {
      status: 403,
      message: 'Please complete your account setup. Check your email for the account setup instructions.'
    };
    const res = formatUserFriendlyError(error);
    assert.equal(res, 'Please complete your account setup. Check your email for the account setup instructions.');
  });

  await t.test('preserves inactive account 403 message', () => {
    const error = {
      status: 403,
      message: 'Inactive account. Please contact system administrator.'
    };
    const res = formatUserFriendlyError(error);
    assert.equal(res, 'Inactive account. Please contact system administrator.');
  });

  await t.test('formats invalid credentials 401 message cleanly', () => {
    const error = {
      status: 401,
      message: 'Incorrect email or password.'
    };
    const res = formatUserFriendlyError(error);
    assert.equal(res, 'Incorrect email or password.');
  });

  await t.test('falls back to generic status message only when no custom message exists', () => {
    assert.equal(formatUserFriendlyError({ status: 404 }), 'Record or page not found.');
    assert.equal(formatUserFriendlyError({ status: 403 }), "You don't have permission to do this.");
    assert.equal(formatUserFriendlyError({ status: 401 }), 'Session expired. Please log in again.');
    assert.equal(formatUserFriendlyError({ status: 429 }), 'Too many sign-in attempts. Please wait a moment.');
  });

  await t.test('formats 429 with countdown seconds accurately', () => {
    const error = {
      status: 429,
      message: 'Too many requests. Please retry after 45 seconds.'
    };
    assert.equal(formatUserFriendlyError(error), 'Too many sign-in attempts. Please wait 45 seconds before trying again.');
  });
});
