'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log technical error details to console for developers
    console.error('[Application Error Boundary caught]:', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main, #0B0F19)',
      color: 'var(--text-main, #F9FAFB)',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        background: 'rgba(17, 24, 39, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '2.5rem 2rem',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.75rem',
          margin: '0 auto 1.25rem',
        }}>
          ⚠️
        </div>
        <h2 style={{
          fontSize: '1.35rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          color: '#F9FAFB',
        }}>
          Something went wrong
        </h2>
        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-muted, #9CA3AF)',
          lineHeight: 1.5,
          marginBottom: '1.75rem',
        }}>
          Please refresh the page or try again. If the problem continues, contact support.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              background: '#6366F1',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '0.65rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#D1D5DB',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '0.65rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
