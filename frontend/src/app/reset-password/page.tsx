'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { isPasswordValid, PASSWORD_ERROR_MESSAGE } from '../../lib/validation';
import PasswordInput from '../../components/PasswordInput';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawToken = searchParams.get('token') || searchParams.get('reset_token') || '';
  let tokenParam = '';
  try {
    tokenParam = decodeURIComponent(rawToken).trim();
  } catch (e) {
    tokenParam = rawToken.trim();
  }
  const emailParam = searchParams.get('email') || '';

  const [token, setToken] = useState(tokenParam);
  const [email, setEmail] = useState(emailParam);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const isPasswordCriteriaMet = isPasswordValid(newPassword);
  const showPasswordError = (formSubmitted && !isPasswordCriteriaMet) || (passwordTouched && newPassword.length > 0 && !isPasswordCriteriaMet);

  useEffect(() => {
    let cleanToken = '';
    try {
      cleanToken = decodeURIComponent(tokenParam).trim();
    } catch (e) {
      cleanToken = tokenParam.trim();
    }
    if (cleanToken) setToken(cleanToken);
    if (emailParam) setEmail(emailParam);
  }, [tokenParam, emailParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormSubmitted(true);

    if (!token.trim()) {
      setError('Password reset link is missing a valid security token.');
      return;
    }

    if (!isPasswordCriteriaMet) {
      return;
    }

    if (!confirmPassword) {
      setError('Please confirm your new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter to confirm.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.resetPassword(token.trim(), newPassword, confirmPassword);
      setIsSuccess(true);
      setSuccessMsg(res.message || 'Password has been successfully updated. You may now log in.');
    } catch (err: any) {
      setError(err.message || 'Unable to reset password. The link may be expired or already used.');
    } finally {
      setLoading(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main, #0B0F19)',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366F1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{
      width: '100%',
      maxWidth: '440px',
      padding: '2.5rem 2rem',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)'
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          fontWeight: '800',
          color: '#FFF',
          margin: '0 auto 1rem',
          boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)'
        }}>
          🔑
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 0.5rem' }}>
          {isSuccess ? 'Password Reset Complete' : 'Reset Your Password'}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {isSuccess
            ? 'Your account password has been securely updated'
            : email
              ? `Enter and confirm a new strong password for ${email}`
              : 'Enter and confirm a new strong password for your account'}
        </p>
      </div>

      {/* Success View */}
      {isSuccess ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34D399',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            marginBottom: '1.5rem'
          }}>
            {successMsg}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem' }}
            onClick={() => router.push('/login')}
          >
            Sign In with New Password
          </button>
        </div>
      ) : !token ? (
        /* Missing Token Error View */
        <div style={{ textAlign: 'center' }}>
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#F87171',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.88rem',
            lineHeight: 1.5,
            marginBottom: '1.5rem'
          }}>
            Missing or invalid password reset link. Please use the link sent to your registered email address.
          </div>
          <Link
            href="/login"
            className="btn btn-primary"
            style={{ display: 'block', width: '100%', padding: '0.85rem', textAlign: 'center' }}
          >
            Return to Login
          </Link>
        </div>
      ) : (
        /* Form View */
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#F87171',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              lineHeight: 1.5
            }}>
              <div>{error}</div>
              {error.toLowerCase().includes('invalid') && (
                <div style={{ marginTop: '0.65rem' }}>
                  <Link href="/login" style={{ color: '#FFF', textDecoration: 'underline', fontWeight: 600 }}>
                    Click here to request a fresh reset link
                  </Link>
                </div>
              )}
            </div>
          )}

          {email && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.65rem 0.85rem',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              color: '#C7D2FE',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>👤</span>
              <span>Account: <strong>{email}</strong></span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">New Password</label>
            <PasswordInput
              placeholder="Enter new strong password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setPasswordTouched(true)}
              hasError={showPasswordError}
              required
              autoFocus
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

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <PasswordInput
              placeholder="Re-enter new password to confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.75rem', fontSize: '0.95rem' }}
          >
            {loading ? 'Updating Password...' : 'Reset & Save Password'}
          </button>

          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.82rem' }}>
            <Link
              href="/login"
              style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              ← Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative'
    }}>
      <Suspense fallback={
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Loading password reset...
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
