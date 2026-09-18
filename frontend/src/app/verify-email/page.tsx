'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawCode = searchParams.get('code') || searchParams.get('token') || searchParams.get('verify_token') || '';
  let initialCode = '';
  try {
    initialCode = decodeURIComponent(rawCode).trim();
  } catch (e) {
    initialCode = rawCode.trim();
  }
  const emailParam = searchParams.get('email') || '';

  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState(emailParam);
  const [resendEmail, setResendEmail] = useState(emailParam);

  // States: 'verifying' | 'success' | 'error' | 'manual'
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'manual'>(
    initialCode ? 'verifying' : 'manual'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendStatusMsg, setResendStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check login status in background for context-aware CTA button
  useEffect(() => {
    api.getCurrentUser()
      .then(() => setIsLoggedIn(true))
      .catch(() => setIsLoggedIn(false));
  }, []);

  // Update local storage user profile upon successful verification
  const syncLocalUserProfile = () => {
    try {
      const stored = localStorage.getItem('user_info');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.is_verified = true;
        parsed.first_login = false;
        localStorage.setItem('user_info', JSON.stringify(parsed));
      }
      localStorage.removeItem('currentUser');
    } catch (e) {
      // Ignore storage errors
    }
  };

  // Perform token verification
  const executeVerification = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) {
      setStatus('manual');
      return;
    }

    setStatus('verifying');
    setErrorMessage(null);

    try {
      const res = await api.verifyEmail(tokenToVerify.trim());
      syncLocalUserProfile();
      setStatus('success');
      setSuccessMessage(res.message || 'Email verified successfully! Your account is now fully active.');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err.message || 'This verification link is invalid, expired, or has already been used.'
      );
    }
  };

  // Auto-verify on mount if code is present
  useEffect(() => {
    let cleanCode = '';
    try {
      cleanCode = decodeURIComponent(rawCode).trim();
    } catch (e) {
      cleanCode = rawCode.trim();
    }

    if (cleanCode) {
      setCode(cleanCode);
      executeVerification(cleanCode);
    } else {
      setStatus('manual');
    }
  }, [rawCode]);

  // Handle manual code submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    executeVerification(code);
  };

  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Handle Resend Verification Email
  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resendCooldown > 0) return;
    if (!resendEmail.trim()) {
      setResendStatusMsg({ text: 'Please enter your email address.', isError: true });
      return;
    }

    setIsResending(true);
    setResendStatusMsg(null);

    try {
      const res = await api.resendVerification(resendEmail.trim());
      setResendStatusMsg({
        text: res.message || `A fresh verification link has been sent to ${resendEmail}.`,
        isError: false
      });
      setResendCooldown(60);
    } catch (err: any) {
      let cooldown = 60;
      const match = (err.message || '').match(/retry after (\d+) seconds/i);
      if (match && match[1]) {
        cooldown = parseInt(match[1], 10);
      }
      setResendCooldown(cooldown);
      setResendStatusMsg({
        text: err.message || 'Unable to resend verification email. Please try again later.',
        isError: true
      });
    } finally {
      setIsResending(false);
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
      maxWidth: '460px',
      margin: '0 auto',
      padding: '2.5rem 2rem',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)'
    }}>
      {/* 1. VERIFYING STATE */}
      {status === 'verifying' && (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '2px solid rgba(99, 102, 241, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '1.75rem',
            animation: 'pulse 1.8s infinite'
          }}>
            🛡️
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#FFF', marginBottom: '0.6rem' }}>
            Verifying Your Email
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Please wait a moment while we securely validate your verification token...
          </p>
          <div style={{
            display: 'inline-block',
            width: '32px',
            height: '32px',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
        </div>
      )}

      {/* 2. SUCCESS STATE */}
      {status === 'success' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '2px solid rgba(16, 185, 129, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            fontSize: '2rem',
            boxShadow: '0 0 24px rgba(16, 185, 129, 0.3)'
          }}>
            ✓
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#FFF', marginBottom: '0.6rem' }}>
            Email Verified!
          </h2>
          <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            {email ? (
              <>Your email <strong style={{ color: '#FFF' }}>{email}</strong> has been successfully verified.</>
            ) : (
              successMessage || 'Your email address has been successfully verified and your account is active.'
            )}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link
              href={isLoggedIn ? '/' : '/login'}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.95rem',
                textAlign: 'center',
                textDecoration: 'none'
              }}
            >
              {isLoggedIn ? 'Continue to Dashboard →' : 'Sign In to Your Account →'}
            </Link>
          </div>
        </div>
      )}

      {/* 3. ERROR STATE */}
      {status === 'error' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '2px solid rgba(244, 63, 94, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '1.8rem',
              boxShadow: '0 0 20px rgba(244, 63, 94, 0.2)'
            }}>
              ✕
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#FFF', marginBottom: '0.5rem' }}>
              Verification Failed
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {errorMessage}
            </p>
          </div>

          {/* Resend Helper Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ fontSize: '0.88rem', color: '#FFF', marginBottom: '0.5rem', fontWeight: 600 }}>
              Need a fresh verification link?
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
              Enter your email below to receive a new one-click verification link in your inbox.
            </p>

            <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <input
                type="email"
                placeholder="Enter your registered email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.88rem',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#FFF'
                }}
              />
              <button
                type="submit"
                disabled={isResending || resendCooldown > 0}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.65rem', fontSize: '0.85rem' }}
              >
                {isResending ? 'Sending Link...' : resendCooldown > 0 ? `Resend Available in ${resendCooldown}s` : 'Send Fresh Verification Link'}
              </button>
            </form>

            {resendStatusMsg && (
              <div style={{
                marginTop: '0.75rem',
                fontSize: '0.82rem',
                color: resendStatusMsg.isError ? '#F87171' : '#34D399'
              }}>
                {resendStatusMsg.text}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
            <button
              type="button"
              onClick={() => setStatus('manual')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Enter Code Manually
            </button>
            <Link
              href="/login"
              style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              ← Back to Sign In
            </Link>
          </div>
        </div>
      )}

      {/* 4. MANUAL TOKEN ENTRY STATE */}
      {status === 'manual' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '2px solid rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              fontSize: '1.6rem'
            }}>
              ✉️
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#FFF', marginBottom: '0.5rem' }}>
              Verify Your Email
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Enter the 6-digit verification code received in your email to activate your account.
            </p>
          </div>

          {errorMessage && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#F87171',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              textAlign: 'center'
            }}>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleManualSubmit}>
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.65rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>
                6-Digit Security Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                autoFocus
                required
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  letterSpacing: '12px',
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: 'var(--radius-md)',
                  color: '#A5B4FC',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={code.trim().length !== 6}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem', marginBottom: '1rem' }}
            >
              Verify Code →
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setStatus('error');
                setErrorMessage('Please request a new code if you did not receive one.');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Resend verification code
            </button>
            <Link
              href="/login"
              style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              ← Back to Sign In
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
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
          Loading email verification...
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
