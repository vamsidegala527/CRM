'use client';

import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  hasError?: boolean;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  inputClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  {
    hasError = false,
    containerClassName = '',
    containerStyle,
    inputClassName = '',
    className = '',
    style,
    disabled = false,
    placeholder = '••••••••',
    onKeyDown,
    ...restProps
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose inner input ref to parent refs
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const toggleVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;

      setShowPassword((prev) => !prev);

      // Restore caret/selection position uninterrupted
      requestAnimationFrame(() => {
        if (input) {
          input.focus();
          if (start !== null && end !== null) {
            input.setSelectionRange(start, end);
          }
        }
      });
    } else {
      setShowPassword((prev) => !prev);
    }
  };

  const finalInputClass = inputClassName || className || 'form-control';

  return (
    <div
      className={containerClassName}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        ...containerStyle,
      }}
    >
      <input
        ref={inputRef}
        type={showPassword ? 'text' : 'password'}
        className={finalInputClass}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={(e) => {
          setIsFocused(true);
          restProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          restProps.onBlur?.(e);
        }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          paddingRight: '2.75rem', // Adequate trailing padding so text never clips behind toggle button
          borderColor: hasError ? '#F87171' : undefined,
          ...style,
        }}
        {...restProps}
      />

      <button
        type="button"
        tabIndex={-1}
        onClick={toggleVisibility}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={disabled}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        title={showPassword ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          padding: '0.35rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: isHovered || isFocused ? '#FFFFFF' : '#94A3B8',
          opacity: disabled ? 0.4 : 1,
          transition: 'color 0.15s ease, opacity 0.15s ease, transform 0.1s ease',
          lineHeight: 1,
          borderRadius: '4px',
          outline: 'none',
          zIndex: 2,
        }}
      >
        {showPassword ? (
          /* EyeOff (slash) icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'block' }}
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        ) : (
          /* Eye icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'block' }}
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
});

export default PasswordInput;
