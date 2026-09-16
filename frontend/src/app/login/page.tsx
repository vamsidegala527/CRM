'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { api, getAuthToken } from '../../lib/api';

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
      // Check if URL has email verification token
      const urlParams = new URLSearchParams(window.location.search);
      const verifyToken = urlParams.get('verify_token');
      if (verifyToken) {
        api.verifyEmail(verifyToken)
          .then((res) => {
            setSuccessMsg(res.message || 'Email verified successfully! You can now sign in.');
          })
          .catch((err) => {
            setError(err.message || 'Email verification link invalid or expired.');
          });
      }

      // Check if URL has password reset token
      const resetTokenParam = urlParams.get('reset_token');
      const emailParam = urlParams.get('email');
      if (resetTokenParam) {
        setAuthMode('forgot');
        setResetStep('reset');
        setResetToken(resetTokenParam);
        if (emailParam) setEmail(emailParam);
        setSuccessMsg('Reset token detected from email link. Please choose your new password below.');
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

  const [authMode, setAuthMode] = useState<'signin' | 'register' | 'forgot'>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Password reset fields
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'reset'>('request');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [gisLoaded, setGisLoaded] = useState(false);

  const handleGoogleCallback = useCallback(async (response: any) => {
    try {
      if (response && response.credential) {
        setLoading(true);
        setError(null);
        await api.googleAuth(response.credential);
        router.push('/');
      } else {
        setError('Google authentication did not return a valid credential.');
      }
    } catch (err: any) {
      console.error('[Google GIS] Auth error:', err);
      setError(err.message || 'An error occurred during Google authentication.');
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
          text: authMode === 'register' ? 'signup_with' : 'signin_with',
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
    if (gisLoaded && authMode !== 'forgot') {
      renderGoogleButton();
    }
  }, [gisLoaded, authMode, renderGoogleButton]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (authMode === 'register') {
        if (!fullName.trim()) {
          setError('Full Name is required for registration.');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          setLoading(false);
          return;
        }
        const hasUpper = /[A-Z]/.test(password);
        const hasLower = /[a-z]/.test(password);
        const hasDigit = /\d/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password);
        if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
          setError('Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.');
          setLoading(false);
          return;
        }

        const res = await api.register({ email, password, full_name: fullName });
        setSuccessMsg(res.message || 'Registration successful! Verification token generated. Please log in.');
        setAuthMode('signin');
        setPassword('');
      } else if (authMode === 'signin') {
        await api.login({ email, password });
        router.push('/');
      } else if (authMode === 'forgot') {
        if (resetStep === 'request') {
          if (!email.trim()) {
            setError('Please enter your account email.');
            setLoading(false);
            return;
          }
          const res = await api.forgotPassword(email);
          setSuccessMsg(res.message || 'Password reset instructions have been sent to your registered email address.');
          setResetStep('reset');
        } else {
          if (!resetToken.trim()) {
            setError('Please enter your password reset token.');
            setLoading(false);
            return;
          }
          if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            setLoading(false);
            return;
          }
          const hasUpper = /[A-Z]/.test(newPassword);
          const hasLower = /[a-z]/.test(newPassword);
          const hasDigit = /\d/.test(newPassword);
          const hasSpecial = /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(newPassword);
          if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
            setError('New password must contain uppercase, lowercase, number, and special character.');
            setLoading(false);
            return;
          }

          const res = await api.resetPassword(resetToken.trim(), newPassword);
          setSuccessMsg(res.message || 'Password successfully reset! You may now sign in.');
          setAuthMode('signin');
          setResetStep('request');
          setResetToken('');
          setNewPassword('');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication request failed.');
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
      padding: '1.5rem',
      position: 'relative'
    }}>
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
            CM
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 0.5rem' }}>
            {authMode === 'register' ? 'Create Account' : authMode === 'forgot' ? 'Reset Password' : 'Sign In'}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {authMode === 'register'
              ? 'Register to manage your isolated customer database'
              : authMode === 'forgot'
                ? (resetStep === 'request' ? 'Request a secure password reset token' : 'Enter your reset token and new password')
                : 'Sign in to access your customer records'}
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

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {authMode === 'register' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          {authMode !== 'forgot' && (
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder="e.g. user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
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
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}

          {authMode === 'forgot' && resetStep === 'reset' && (
            <>
              <div className="form-group">
                <label className="form-label">Reset Token</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Paste 64-char reset token"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Enter new strong password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.35rem', display: 'block' }}>
                  Must be at least 8 characters with uppercase, lowercase, number, and symbol
                </small>
              </div>
            </>
          )}

          {authMode !== 'forgot' && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Password</label>
                {authMode === 'signin' && (
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
                )}
              </div>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {authMode === 'register' && (
                <div style={{ marginTop: '0.45rem', fontSize: '0.75rem' }}>
                  <div style={{ marginBottom: '0.35rem', color: 'var(--text-subtle)' }}>
                    Must be at least 8 characters
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      background: password.length >= 8 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: password.length >= 8 ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${password.length >= 8 ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`
                    }}>
                      {password.length >= 8 ? '✓' : '•'} 8+ chars
                    </span>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      background: /[A-Z]/.test(password) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: /[A-Z]/.test(password) ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${/[A-Z]/.test(password) ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`
                    }}>
                      {/[A-Z]/.test(password) ? '✓' : '•'} Uppercase
                    </span>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      background: /[a-z]/.test(password) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: /[a-z]/.test(password) ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${/[a-z]/.test(password) ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`
                    }}>
                      {/[a-z]/.test(password) ? '✓' : '•'} Lowercase
                    </span>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      background: /\d/.test(password) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: /\d/.test(password) ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${/\d/.test(password) ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`
                    }}>
                      {/\d/.test(password) ? '✓' : '•'} Number
                    </span>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      background: /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password) ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password) ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`
                    }}>
                      {/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/;~`]/.test(password) ? '✓' : '•'} Symbol
                    </span>
                  </div>
                </div>
              )}
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
              : authMode === 'register'
                ? 'Register'
                : authMode === 'forgot'
                  ? (resetStep === 'request' ? 'Send Reset Token' : 'Confirm New Password')
                  : 'Sign In'}
          </button>
        </form>

        {/* Forgot Password helpers */}
        {authMode === 'forgot' && (
          <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem' }}>
            {resetStep === 'request' ? (
              <button
                type="button"
                onClick={() => setResetStep('reset')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Already have a reset token? Enter token
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setResetStep('request')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Need to request token again?
              </button>
            )}
          </div>
        )}

        {/* OR Separator & Google Sign-In Container (Only for Sign-In and Register) */}
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
              style={{ display: 'flex', justifyContent: 'center', minHeight: '44px', width: '100%' }}
            />
          </div>
        )}

        {/* Toggle Mode */}
        <div style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: 'var(--text-muted)'
        }}>
          {authMode === 'register' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setAuthMode('signin'); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
              >
                Sign In
              </button>
            </>
          ) : authMode === 'forgot' ? (
            <button
              type="button"
              onClick={() => { setAuthMode('signin'); setError(null); setSuccessMsg(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
            >
              ← Back to Sign In
            </button>
          ) : (
            <>
              Need a new account?{' '}
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
              >
                Register Here
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
