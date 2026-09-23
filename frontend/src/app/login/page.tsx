'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { api } from '../../lib/api';
import { formatUserFriendlyError } from '../../lib/errorUtils';
import PasswordInput from '../../components/PasswordInput';
import { validateEmail, EMAIL_ERROR_MESSAGE } from '../../lib/validators/emailValidator';

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const router = useRouter();

  // If already authenticated via HttpOnly cookie, redirect directly to dashboard
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Redirect email verification tokens or codes to dedicated verification page
      const urlParams = new URLSearchParams(window.location.search);
      const verifyToken = urlParams.get('verify_token') || urlParams.get('code');
      if (verifyToken) {
        router.replace(`/verify-email?code=${verifyToken}&email=${urlParams.get('email') || ''}`);
        return;
      }

      // Redirect password reset tokens to dedicated reset password page
      const resetTokenParam = urlParams.get('reset_token') || urlParams.get('token');
      const emailParam = urlParams.get('email');
      if (resetTokenParam) {
        router.replace(`/reset-password?token=${resetTokenParam}&email=${emailParam || ''}`);
        return;
      }

      api.getCurrentUser()
        .then(() => {
          router.replace('/');
        })
        .catch(() => {
          // Token is invalid/expired; remain on login page
        });
    }
  }, [router]);

  const [authMode, setAuthMode] = useState<'signin' | 'forgot'>('signin');

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  // Password reset step (request link or link sent confirmation)
  const [resetStep, setResetStep] = useState<'request' | 'sent'>('request');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [gisLoaded, setGisLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGoogleCallback = useCallback(async (response: any) => {
    try {
      if (response && response.credential) {
        setLoading(true);
        setError(null);
        await api.googleAuth(response.credential);
        router.push('/');
      } else {
        setError('Google sign-in was canceled. Please try again.');
      }
    } catch (err: any) {
      console.error('[Google GIS] Auth error:', err);
      setError(formatUserFriendlyError(err, 'Google sign-in failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [router]);

  const renderGoogleButton = useCallback(() => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '64576092611-tlgd7s6jcubbtmk94ho741tjebvjdtbo.apps.googleusercontent.com';
    if (!googleClientId) {
      console.warn('[Google GIS] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.');
      return;
    }

    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      const container = document.getElementById('googleSignInBtn');
      if (container) {
        container.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCallback,
        });

        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          width: 376,
          shape: 'rectangular',
          text: 'signin_with',
        });
      }
    }
  }, [authMode, handleGoogleCallback]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      setGisLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (mounted && gisLoaded && authMode !== 'forgot') {
      renderGoogleButton();
    }
  }, [mounted, gisLoaded, authMode, renderGoogleButton]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const emailRes = validateEmail(email);
    if (!emailRes.isValid) {
      setEmailTouched(true);
      setEmailError(EMAIL_ERROR_MESSAGE);
      return;
    }

    setLoading(true);

    try {
      if (authMode === 'signin') {
        await api.login({ email: emailRes.sanitizedEmail, password });
        router.push('/');
      } else if (authMode === 'forgot') {
        const res = await api.forgotPassword(emailRes.sanitizedEmail);
        setSuccessMsg(res.message || 'Password reset link sent! Please check your email.');
        setResetStep('sent');
      }
    } catch (err: any) {
      setError(formatUserFriendlyError(err, 'Incorrect email or password.'));
    } finally {
      setLoading(false);
    }
  };

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
    <div
      suppressHydrationWarning
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative'
      }}
    >
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setGisLoaded(true);
        }}
      />

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
            HR
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 0.5rem' }}>
            {authMode === 'forgot' ? 'Reset Password' : 'Sign In'}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {authMode === 'forgot'
              ? (resetStep === 'request'
                  ? 'Enter your registered email to receive a password-reset link'
                  : 'Check your inbox for the reset link')
              : 'Sign in to your organization account'}
          </p>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34D399',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '1.25rem'
          }}>
            {successMsg}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#F87171',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        {authMode === 'forgot' && resetStep === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#818CF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
              margin: '0 auto 1.25rem'
            }}>
              ✉️
            </div>
            <h3 style={{ fontSize: '1.2rem', color: '#FFF', marginBottom: '0.65rem', fontWeight: 700 }}>
              Password Reset Link Sent
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              We have sent a secure password-reset link to <strong style={{ color: '#FFF' }}>{email}</strong>.
              <br /><br />
              Please open the link received in your email to open the password-reset page and choose your new password.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.8rem', marginBottom: '0.75rem' }}
              onClick={() => {
                setAuthMode('signin');
                setResetStep('request');
                setError(null);
                setSuccessMsg(null);
              }}
            >
              Back to Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setResetStep('request');
                setError(null);
                setSuccessMsg(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Didn't receive email? Try again
            </button>
          </div>
        ) : (
        /* Form */
        <form onSubmit={handleSubmit}>
          {authMode === 'signin' && (
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                style={emailError ? { borderColor: 'var(--accent-rose, #F43F5E)' } : undefined}
                required
              />
              {emailError && (
                <span style={{ display: 'block', fontSize: '0.78rem', color: '#F43F5E', marginTop: '0.35rem' }}>
                  {emailError}
                </span>
              )}
            </div>
          )}

          {authMode === 'forgot' && resetStep === 'request' && (
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="Enter your account email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                style={emailError ? { borderColor: 'var(--accent-rose, #F43F5E)' } : undefined}
                required
              />
              {emailError && (
                <span style={{ display: 'block', fontSize: '0.78rem', color: '#F43F5E', marginTop: '0.35rem' }}>
                  {emailError}
                </span>
              )}
            </div>
          )}

          {authMode === 'signin' && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('forgot');
                    setResetStep('request');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', fontSize: '0.95rem' }}
          >
            {loading
              ? 'Processing...'
              : authMode === 'forgot'
                ? 'Send Password Reset Link'
                : 'Sign In'}
          </button>
        </form>
        )}

        {/* OR Separator & Google Sign-In Container (Only for Sign-In) */}
        {authMode !== 'forgot' && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '1.25rem 0',
              color: 'var(--text-muted)',
              fontSize: '0.8rem'
            }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
              <span style={{ padding: '0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
            </div>

            <div
              id="googleSignInBtn"
              suppressHydrationWarning
              style={{ display: 'flex', justifyContent: 'center', minHeight: '44px', width: '100%' }}
            />

            {/* Account Provisioning Notice */}
            <div style={{
              marginTop: '1.75rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              textAlign: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-muted, #94A3B8)',
              lineHeight: 1.5
            }}>
              Need an account? Accounts are provisioned by invitation. Please contact your organization to receive access.
            </div>
          </div>
        )}

        {/* Toggle Back to Sign In */}
        {authMode === 'forgot' && resetStep === 'request' && (
          <div style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: 'var(--text-muted)'
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode('signin'); setError(null); setSuccessMsg(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
            >
              ← Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
