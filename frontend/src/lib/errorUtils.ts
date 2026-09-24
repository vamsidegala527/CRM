/**
 * Utility functions for user-friendly error formatting.
 * Replaces technical developer messages, status codes, and server jargon
 * with simple, human-friendly text.
 */

export function formatUserFriendlyError(error: any, fallback: string = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;

  // Extract message string
  let msg = typeof error === 'string' ? error : (error.message || '');
  if (typeof msg === 'string') {
    msg = msg
      .replace(/^API Error\s*\(\d+\):\s*/i, '')
      .replace(/^Value error,\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim();
  }

  // Extract HTTP status code if available
  const status = error.status || (typeof error.status === 'number' ? error.status : null);

  const lowerMsg = (msg || '').toLowerCase().trim();
  const isGenericStatusMsg = !msg || [
    'not found',
    'unauthorized',
    'forbidden',
    'bad request',
    'internal server error',
    'record or page not found.',
    'session expired. please log in again.',
    "you don't have permission to do this."
  ].includes(lowerMsg);

  // Status code mappings - only used when no specific custom message was provided
  if (isGenericStatusMsg) {
    if (status === 502 || status === 503 || status === 504) {
      return 'Please try again in a few moments.';
    }
    if (status === 500) {
      return 'Something went wrong. Please try again.';
    }
    if (status === 404) {
      return 'Record or page not found.';
    }
    if (status === 401) {
      return 'Session expired. Please log in again.';
    }
    if (status === 403) {
      return "You don't have permission to do this.";
    }
  }
  if (status === 429) {
    const secondsMatch = (msg || '').match(/(\d+)\s*(?:seconds|secs|s)/i);
    if (secondsMatch) {
      return `Too many sign-in attempts. Please wait ${secondsMatch[1]} seconds before trying again.`;
    }
    if (!lowerMsg.includes('locked') && !lowerMsg.includes('retry after')) {
      return 'Too many sign-in attempts. Please wait a moment.';
    }
  }

  const lower = msg.toLowerCase();

  // Brute-force lockout and rate limit friendly messages
  if (lower.includes('account temporarily locked') || lower.includes('repeated failed login')) {
    return msg.replace(/^Account temporarily locked due to repeated failed login attempts\.\s*/i, 'Account locked: ');
  }

  // Network, cold-start, or connectivity errors
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('econnrefused') ||
    lower.includes('unable to reach') ||
    lower.includes('proxy unable') ||
    lower.includes('cold start') ||
    lower.includes('cold-start') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return 'Please try again in a few moments.';
  }

  // Gateway and server errors
  if (lower.includes('502') || lower.includes('503') || lower.includes('504') || lower.includes('bad gateway')) {
    return ' Please try again in a few moments.';
  }

  if (lower.includes('500') || lower.includes('internal server error')) {
    return 'Something went wrong. Please try again.';
  }

  // Simplify developer jargon
  if (lower.includes('unauthorized') || lower.includes('credentials')) {
    return 'Incorrect email or password.';
  }

  if (lower.includes('verification token')) {
    return msg.replace(/verification token/gi, 'verification code');
  }

  if (lower.includes('reset token')) {
    return msg.replace(/reset token/gi, 'reset link');
  }

  if (lower.includes('setup token') || lower.includes('invitation token')) {
    return msg.replace(/setup token|invitation token/gi, 'setup link');
  }

  // If message contains raw JSON (e.g. from Pydantic detail)
  if (msg.startsWith('{') || msg.startsWith('[')) {
    try {
      const parsed = JSON.parse(msg);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].msg) {
        return parsed[0].msg.replace(/^Value error,\s*/i, '');
      }
      if (parsed.detail && typeof parsed.detail === 'string') {
        return parsed.detail;
      }
    } catch {
      // ignore parse failure
    }
    return fallback;
  }

  return msg || fallback;
}
