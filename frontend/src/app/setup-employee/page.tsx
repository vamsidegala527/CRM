'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { formatUserFriendlyError } from '../../lib/errorUtils';
import { isPasswordValid, PASSWORD_ERROR_MESSAGE } from '../../lib/validation';
import PasswordInput from '../../components/PasswordInput';
import { validateEmail, EMAIL_ERROR_MESSAGE } from '../../lib/validators/emailValidator';

function SetupEmployeeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const rawToken = searchParams.get('token') || '';
    const rawEmail = searchParams.get('email') || '';
    let decodedToken = rawToken.trim();
    let decodedEmail = rawEmail.trim();

    try {
      if (decodedToken.includes('%')) decodedToken = decodeURIComponent(decodedToken);
      if (decodedEmail.includes('%')) decodedEmail = decodeURIComponent(decodedEmail);
    } catch (_) {}

    setToken(decodedToken);
    setEmail(decodedEmail);

    if (!decodedToken) {
      setError('Setup link is invalid or missing. Please contact your administrator.');
    }
  }, [searchParams]);

  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleEmailBlur = () => {
    setEmailTouched(true);
    if (!email.trim()) {
      setEmailError(EMAIL_ERROR_MESSAGE);
    } else {
      const res = validateEmail(email);
      setEmailError(res.isValid ? null : EMAIL_ERROR_MESSAGE);
    }
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (emailTouched) {
      const res = validateEmail(val);
      setEmailError(res.isValid ? null : EMAIL_ERROR_MESSAGE);
    }
  };

  const isPasswordCriteriaMet = isPasswordValid(password);
  const showPasswordError = (formSubmitted && !isPasswordCriteriaMet) || (passwordTouched && password.length > 0 && !isPasswordCriteriaMet);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    setFormSubmitted(true);

    const cleanToken = token.trim();
    const cleanEmail = email.trim();

    if (!cleanToken) {
      setError('Setup link is missing. Please use the link from your email.');
      return;
    }

    const emailRes = validateEmail(cleanEmail);
    if (!emailRes.isValid) {
      setEmailTouched(true);
      setEmailError(EMAIL_ERROR_MESSAGE);
      return;
    }

    if (!isPasswordCriteriaMet) {
      return;
    }

    if (!confirmPassword) {
      setError('Please confirm your new password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your new password.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.setupEmployeeAccount({
        token: cleanToken,
        email: emailRes.sanitizedEmail,
        new_password: password,
        confirm_password: confirmPassword,
      });

      setSuccess(response.message || 'Account setup successful! Redirecting to login...');
      setTimeout(() => {
        router.push('/');
      }, 2500);
    } catch (err: any) {
      setError(formatUserFriendlyError(err, 'Unable to set up account. The link may have expired.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 45%), radial-gradient(circle at bottom left, rgba(6, 182, 212, 0.12), transparent 50%), #0B0F19',
      padding: '2rem 1rem'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '2.5rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.1)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '1.4rem',
            color: '#FFFFFF',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)',
            marginBottom: '1rem'
          }}>
            HR
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
            Set Up Your Account
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#94A3B8', margin: 0 }}>
            Choose a secure password to activate your employee portal access.
          </p>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            padding: '1rem',
            color: '#FCA5A5',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <span style={{ fontWeight: 600 }}>{error}</span>
            </div>
            {error.includes('already been set up') ? (
              <div style={{ marginTop: '0.75rem' }}>
                <Link
                  href="/"
                  style={{
                    display: 'inline-block',
                    padding: '0.4rem 0.9rem',
                    background: '#6366F1',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  Sign In to Your Account →
                </Link>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: '#CBD5E1', borderTop: '1px solid rgba(239, 68, 68, 0.2)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                💡 <strong>Tip:</strong> If you received multiple invitation emails, click the link in your newest email. Or ask your administrator to click <strong>"Copy Setup Link" (🔗)</strong> in the HR Portal to give you an active link directly.
              </div>
            )}
          </div>
        )}

        {success && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            color: '#6EE7B7',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>✓</span>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Email input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '0.4rem' }}>
              Employee Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
              required
              readOnly={Boolean(searchParams.get('email'))}
              placeholder="name@company.com"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: searchParams.get('email') ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.06)',
                border: emailError ? '1px solid var(--accent-rose, #F43F5E)' : '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                color: searchParams.get('email') ? '#94A3B8' : '#FFFFFF',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: searchParams.get('email') ? 'not-allowed' : 'text'
              }}
            />
            {emailError && (
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#F43F5E', marginTop: '0.35rem' }}>
                {emailError}
              </span>
            )}
          </div>

          {/* New Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '0.4rem' }}>
              New Password
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordTouched(true)}
              required
              placeholder="Choose a strong password"
              hasError={showPasswordError}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            {showPasswordError && (
              <div
                style={{
                  marginTop: '0.45rem',
                  fontSize: '0.8rem',
                  color: '#F87171',
                  lineHeight: 1.4,
                }}
              >
                {PASSWORD_ERROR_MESSAGE}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '0.4rem' }}>
              Confirm Password
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter your new password"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              padding: '0.85rem',
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}
          >
            {loading ? 'Setting up account...' : 'Complete Account Setup'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: '#94A3B8' }}>
          Already have your password?{' '}
          <Link href="/" style={{ color: '#818CF8', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SetupEmployeePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0F19', color: '#94A3B8' }}>
        Loading setup form...
      </div>
    }>
      <SetupEmployeeContent />
    </Suspense>
  );
}
