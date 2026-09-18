'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';

function SetupEmployeeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const urlToken = (searchParams.get('token') || '').trim();
    const urlEmail = (searchParams.get('email') || '').trim();
    setToken(urlToken);
    setEmail(urlEmail);

    if (!urlToken) {
      setError('Invalid or missing setup link. Please click the link in your invitation email.');
    }
  }, [searchParams]);

  // Password complexity checks
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const isFormValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch;

  const invCode = token ? token.slice(0, 8).toUpperCase() : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanToken = token.trim();
    const cleanEmail = email.trim();

    if (!cleanToken) {
      setError('Setup invitation token is missing. Please use the link provided in your newest email.');
      return;
    }

    if (!cleanEmail) {
      setError('Please provide your employee email address.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your new password.');
      return;
    }

    if (!isFormValid) {
      setError('Please ensure your password meets all complexity requirements below.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.setupEmployeeAccount({
        token: cleanToken,
        email: cleanEmail,
        new_password: password,
        confirm_password: confirmPassword,
      });

      setSuccess(response.message || 'Your account has been set up successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/');
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to complete employee account setup. The link may have expired.');
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
          <p style={{ fontSize: '0.875rem', color: '#94A3B8', margin: '0 0 0.75rem' }}>
            Choose a secure password to activate your employee portal access.
          </p>
          {invCode && (
            <div style={{
              display: 'inline-block',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#A5B4FC',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontWeight: 600
            }}>
              Invitation Code: #{invCode}
            </div>
          )}
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
                💡 <strong>Tip:</strong> If you received multiple invitation emails, open your inbox and click the link in the <em>most recent</em> email (check the Invitation Code in the subject).
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
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={Boolean(searchParams.get('email'))}
              placeholder="name@company.com"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: searchParams.get('email') ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                color: searchParams.get('email') ? '#94A3B8' : '#FFFFFF',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: searchParams.get('email') ? 'not-allowed' : 'text'
              }}
            />
          </div>

          {/* New Password */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1' }}>
                New Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818CF8',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Choose a strong password"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '0.4rem' }}>
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter your new password"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Password Complexity checklist */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            fontSize: '0.75rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.4rem'
          }}>
            <span style={{ color: hasMinLength ? '#34D399' : '#64748B' }}>
              {hasMinLength ? '✓' : '○'} At least 8 characters
            </span>
            <span style={{ color: hasUppercase ? '#34D399' : '#64748B' }}>
              {hasUppercase ? '✓' : '○'} One uppercase letter
            </span>
            <span style={{ color: hasLowercase ? '#34D399' : '#64748B' }}>
              {hasLowercase ? '✓' : '○'} One lowercase letter
            </span>
            <span style={{ color: hasNumber ? '#34D399' : '#64748B' }}>
              {hasNumber ? '✓' : '○'} One number (0-9)
            </span>
            <span style={{ color: hasSpecial ? '#34D399' : '#64748B' }}>
              {hasSpecial ? '✓' : '○'} One special character
            </span>
            <span style={{ color: passwordsMatch ? '#34D399' : '#64748B' }}>
              {passwordsMatch ? '✓' : '○'} Passwords match
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !isFormValid}
            style={{
              marginTop: '0.5rem',
              padding: '0.85rem',
              background: isFormValid
                ? 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)'
                : 'rgba(255, 255, 255, 0.1)',
              color: isFormValid ? '#FFFFFF' : '#64748B',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isFormValid && !loading ? 'pointer' : 'not-allowed',
              boxShadow: isFormValid ? '0 4px 14px rgba(99, 102, 241, 0.35)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {loading ? 'Activating Account...' : 'Complete Account Setup'}
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
