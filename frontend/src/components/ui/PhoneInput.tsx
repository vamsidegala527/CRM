'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { CountryCode, CountryItem } from '../../lib/phoneUtils';
import {
  COUNTRIES,
  getCountryByCode,
  extractCountryFromPhoneNumber,
  validatePhoneNumber,
  formatAsYouType,
  formatToE164,
  getExamplePlaceholder,
} from '../../lib/phoneUtils';

export interface PhoneInputProps {
  value?: string | null;
  onChange: (e164Value: string, isValid: boolean) => void;
  defaultCountry?: CountryCode;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  className?: string;
  containerStyle?: React.CSSProperties;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value = '',
  onChange,
  defaultCountry = 'US',
  label,
  required = false,
  disabled = false,
  hasError = false,
  errorMessage = 'Please provide a valid phone number',
  placeholder,
  id,
  name,
  className = '',
  containerStyle,
}) => {
  // Detect country from initial value if international (+...), otherwise defaultCountry
  const detectedInitialCountry = useMemo(() => {
    if (value && typeof value === 'string' && value.trim().startsWith('+')) {
      const extracted = extractCountryFromPhoneNumber(value);
      if (extracted) return extracted;
    }
    return defaultCountry;
  }, [defaultCountry]); // only derive on mount / defaultCountry change

  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(detectedInitialCountry);
  const [displayValue, setDisplayValue] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [touched, setTouched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Sync internal displayValue when external value changes
  useEffect(() => {
    if (!value || !value.trim()) {
      setDisplayValue('');
      return;
    }

    const trimmed = value.trim();
    if (trimmed.startsWith('+')) {
      const countryFromVal = extractCountryFromPhoneNumber(trimmed);
      if (countryFromVal && countryFromVal !== selectedCountry) {
        setSelectedCountry(countryFromVal);
      }
      const activeCountry = countryFromVal || selectedCountry;
      const formatted = formatAsYouType(trimmed, activeCountry);
      setDisplayValue(formatted);
    } else {
      const formatted = formatAsYouType(trimmed, selectedCountry);
      setDisplayValue(formatted);
    }
  }, [value]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opened
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Filtered countries based on search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return COUNTRIES;
    const query = searchQuery.toLowerCase().trim();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.dialCode.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const activeCountryItem: CountryItem = useMemo(() => {
    return getCountryByCode(selectedCountry);
  }, [selectedCountry]);

  // Dynamic validation check
  const isValid = useMemo(() => {
    if (!displayValue.trim()) {
      return !required;
    }
    const e164 = formatToE164(displayValue, selectedCountry);
    return validatePhoneNumber(e164, selectedCountry);
  }, [displayValue, selectedCountry, required]);

  // Handle phone input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawInput = e.target.value;
      setTouched(true);

      // If user typed or pasted an international number starting with +
      if (rawInput.trim().startsWith('+')) {
        const countryDetected = extractCountryFromPhoneNumber(rawInput);
        const targetCountry = countryDetected || selectedCountry;
        if (countryDetected && countryDetected !== selectedCountry) {
          setSelectedCountry(countryDetected);
        }

        const formatted = formatAsYouType(rawInput, targetCountry);
        setDisplayValue(formatted);

        const e164 = formatToE164(formatted, targetCountry);
        const valid = validatePhoneNumber(e164, targetCountry);
        onChange(e164, valid);
        return;
      }

      // Normal national typing
      const formatted = formatAsYouType(rawInput, selectedCountry);
      setDisplayValue(formatted);

      if (!formatted.trim()) {
        onChange('', !required);
        return;
      }

      const e164 = formatToE164(formatted, selectedCountry);
      const valid = validatePhoneNumber(e164, selectedCountry);
      onChange(e164, valid);
    },
    [selectedCountry, onChange, required]
  );

  // Handle country selection from dropdown
  const handleSelectCountry = useCallback(
    (newCountry: CountryCode) => {
      setSelectedCountry(newCountry);
      setIsDropdownOpen(false);
      setSearchQuery('');

      // Reformat existing digits for the new country
      if (displayValue.trim()) {
        const digitsOnly = displayValue.replace(/\D/g, '');
        const newFormatted = formatAsYouType(digitsOnly, newCountry);
        setDisplayValue(newFormatted);

        const e164 = formatToE164(newFormatted, newCountry);
        const valid = validatePhoneNumber(e164, newCountry);
        onChange(e164, valid);
      }

      setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 50);
    },
    [displayValue, onChange]
  );

  const showError = (touched || hasError) && !isValid && displayValue.trim().length > 0;
  const currentPlaceholder = placeholder || getExamplePlaceholder(selectedCountry);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative', ...containerStyle }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--text-main)',
            marginBottom: '0.35rem',
          }}
        >
          {label} {required && <span style={{ color: 'var(--accent-rose, #F43F5E)' }}>*</span>}
        </label>
      )}

      {/* Input Group: Country Selector Button + Formatted Text Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          background: 'rgba(15, 23, 42, 0.6)',
          border: showError
            ? '1px solid var(--accent-rose, #F43F5E)'
            : '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm, 8px)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          boxShadow: showError ? '0 0 0 2px rgba(244, 63, 94, 0.2)' : 'none',
        }}
      >
        {/* Country Selector Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsDropdownOpen((prev) => !prev)}
          title={`Country: ${activeCountryItem.name} (${activeCountryItem.dialCode})`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.72rem 0.75rem',
            background: isDropdownOpen ? 'rgba(30, 41, 64, 0.9)' : 'rgba(255, 255, 255, 0.04)',
            border: 'none',
            borderRight: '1px solid var(--border-color)',
            borderTopLeftRadius: 'var(--radius-sm, 8px)',
            borderBottomLeftRadius: 'var(--radius-sm, 8px)',
            color: 'var(--text-main, #F8FAFC)',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            flexShrink: 0,
            transition: 'background 0.2s',
          }}
        >
          <span style={{ fontSize: '1.15rem', lineHeight: 1 }} role="img" aria-label={activeCountryItem.name}>
            {activeCountryItem.flag}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-subtle, #94A3B8)', letterSpacing: '0.02em' }}>
            {activeCountryItem.dialCode}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-subtle)', marginLeft: '0.1rem', transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </button>

        {/* National Number Input */}
        <input
          ref={phoneInputRef}
          type="tel"
          id={id}
          name={name}
          disabled={disabled}
          value={displayValue}
          onChange={handleInputChange}
          onBlur={() => setTouched(true)}
          placeholder={currentPlaceholder}
          className={className}
          style={{
            flex: 1,
            padding: '0.75rem 0.85rem',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            color: 'var(--text-main, #F8FAFC)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            width: '100%',
          }}
        />
      </div>

      {/* Accessible Searchable Dropdown Menu */}
      {isDropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '320px',
            maxWidth: '90vw',
            maxHeight: '300px',
            background: '#131B2E',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 'var(--radius-md, 12px)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Search Box */}
          <div style={{ padding: '0.65rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(15, 23, 42, 0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(30, 41, 59, 0.8)', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>🔍</span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or code..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#F8FAFC',
                  fontSize: '0.8rem',
                  width: '100%',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Country List Options */}
          <div
            style={{
              overflowY: 'auto',
              maxHeight: '230px',
              padding: '0.3rem',
            }}
          >
            {filteredCountries.length > 0 ? (
              filteredCountries.map((c) => {
                const isSelected = c.code === selectedCountry;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCountry(c.code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: isSelected ? '#A5B4FC' : 'var(--text-main, #F8FAFC)',
                      fontSize: '0.82rem',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{c.flag}</span>
                      <span style={{ fontWeight: isSelected ? 600 : 400 }}>{c.name}</span>
                    </div>
                    <span style={{ color: 'var(--text-subtle, #94A3B8)', fontSize: '0.78rem', fontWeight: 500 }}>
                      {c.dialCode}
                    </span>
                  </button>
                );
              })
            ) : (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.8rem' }}>
                No country found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Field Error Message */}
      {showError && (
        <div
          role="alert"
          style={{
            color: 'var(--accent-rose, #F43F5E)',
            fontSize: '0.78rem',
            marginTop: '0.35rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 500,
          }}
        >
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
