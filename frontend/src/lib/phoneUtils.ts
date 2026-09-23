import type { CountryCode } from 'libphonenumber-js';
import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  AsYouType,
  getCountryCallingCode,
} from 'libphonenumber-js';

export type { CountryCode };

export interface CountryItem {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
}

// Comprehensive ISO 3166-1 alpha-2 country list with dial codes and flag emojis
export const COUNTRIES: CountryItem[] = [
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { code: 'BE', name: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { code: 'TW', name: 'Taiwan', dialCode: '+886', flag: '🇹🇼' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲' },
  { code: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { code: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { code: 'PA', name: 'Panama', dialCode: '+507', flag: '🇵🇦' },
  { code: 'CZ', name: 'Czech Republic', dialCode: '+420', flag: '🇨🇿' },
  { code: 'HU', name: 'Hungary', dialCode: '+36', flag: '🇭🇺' },
  { code: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴' },
  { code: 'GR', name: 'Greece', dialCode: '+30', flag: '🇬🇷' },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵' },
];

/** Map code to CountryItem for quick lookup */
const COUNTRY_MAP = new Map<CountryCode, CountryItem>();
COUNTRIES.forEach((c) => COUNTRY_MAP.set(c.code, c));

export function getCountryByCode(code: CountryCode): CountryItem {
  return (
    COUNTRY_MAP.get(code) || {
      code,
      name: code,
      dialCode: `+${getCountryCallingCode(code)}`,
      flag: '🌐',
    }
  );
}

/**
 * Parses any phone string to identify if it is in international format
 * and extracts the country code.
 */
export function extractCountryFromPhoneNumber(phone: string): CountryCode | null {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed && parsed.country) {
      return parsed.country;
    }
  }
  return null;
}

/**
 * Validates a phone number against a specific country or international standard.
 * Returns true if empty (when optional).
 */
export function validatePhoneNumber(phone: string, country?: CountryCode): boolean {
  if (!phone || typeof phone !== 'string') return true;
  const trimmed = phone.trim();
  if (!trimmed) return true;

  try {
    return isValidPhoneNumber(trimmed, country);
  } catch {
    return false;
  }
}

/**
 * Formats a given input string using AsYouType formatter for the specified country.
 */
export function formatAsYouType(input: string, country: CountryCode): string {
  if (!input) return '';
  const asYouType = new AsYouType(country);
  return asYouType.input(input);
}

/**
 * Converts a raw or national phone number into a canonical E.164 string (e.g. +14155552671).
 * Returns empty string if the input is empty.
 */
export function formatToE164(input: string, country: CountryCode): string {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();
  try {
    const parsed = parsePhoneNumberFromString(trimmed, country);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
    // If it's already an international number
    if (trimmed.startsWith('+')) {
      const parsedIntl = parsePhoneNumberFromString(trimmed);
      if (parsedIntl && parsedIntl.isValid()) {
        return parsedIntl.format('E.164');
      }
    }
    // Fallback: digits only prefixed with country dial code if not already
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    const dialCodeDigits = getCountryCallingCode(country);
    if (digits.startsWith(dialCodeDigits)) {
      return `+${digits}`;
    }
    return `+${dialCodeDigits}${digits}`;
  } catch {
    return trimmed;
  }
}

/**
 * Formats a stored E.164 or raw phone number for human-friendly read-only display.
 * e.g., +14155552671 -> "+1 (415) 555-2671"
 */
export function formatPhoneNumberDisplay(phone?: string | null): string {
  if (!phone || !phone.trim() || phone === '—' || phone === '-') return '—';
  const trimmed = phone.trim();
  try {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed && parsed.isValid()) {
      return parsed.formatInternational();
    }
  } catch {}
  return trimmed;
}

/**
 * Returns dynamic placeholder example for a country
 */
export function getExamplePlaceholder(country: CountryCode): string {
  switch (country) {
    case 'US':
    case 'CA':
      return '(555) 123-4567';
    case 'GB':
      return '07123 456789';
    case 'IN':
      return '98765 43210';
    case 'AU':
      return '0412 345 678';
    case 'DE':
      return '0151 12345678';
    case 'FR':
      return '06 12 34 56 78';
    case 'AE':
      return '050 123 4567';
    case 'SG':
      return '8123 4567';
    default:
      return 'Phone number';
  }
}
