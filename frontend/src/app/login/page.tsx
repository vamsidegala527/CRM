'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { api } from '../../lib/api';

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

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
          text: isRegister ? 'signup_with' : 'signin_with',
        });
      }
    }
  }, [isRegister, handleGoogleCallback]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      setGisLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (gisLoaded) {
      renderGoogleButton();
    }
  }, [gisLoaded, isRegister, renderGoogleButton]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!fullName.trim()) {
          setError('Full Name is required for registration.');
          setLoading(false);
          return;
        }
        await api.register({ email, password, full_name: fullName });
        setSuccessMsg('Registration successful! Please log in with your credentials.');
        setIsRegister(false);
        setPassword('');
      } else {
        await api.login({ email, password });
        router.push('/');
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
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {isRegister ? 'Register to manage your isolated customer database' : 'Sign in to access your customer records'}
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
          {isRegister && (
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

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', fontSize: '0.95rem' }}
          >
            {loading ? (isRegister ? 'Creating Account...' : 'Signing In...') : (isRegister ? 'Register' : 'Sign In')}
          </button>
        </form>

        {/* OR Separator & Google Sign-In Container */}
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

        {/* Toggle Mode */}
        <div style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: 'var(--text-muted)'
        }}>
          {isRegister ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setIsRegister(false); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Need a new account?{' '}
              <button
                type="button"
                onClick={() => { setIsRegister(true); setError(null); }}
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
