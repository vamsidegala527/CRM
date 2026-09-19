/**
 * Standard password validation criteria for the entire application:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special symbol
 */
export const isPasswordValid = (password: string): boolean => {
  if (!password || password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
};

export const PASSWORD_ERROR_MESSAGE = 'please provide a valid password';
