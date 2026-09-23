'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatUserFriendlyError } from '../lib/errorUtils';
import { isPasswordValid, PASSWORD_ERROR_MESSAGE } from '../lib/validation';
import PasswordInput from './PasswordInput';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  showNotification,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordTouched(false);
      setFormSubmitted(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const isPasswordCriteriaMet = isPasswordValid(newPassword);
  const showPasswordError =
    (formSubmitted && !isPasswordCriteriaMet) ||
    (passwordTouched && newPassword.length > 0 && !isPasswordCriteriaMet);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);

    if (!currentPassword) {
      showNotification('Please enter your current password.', 'error');
      return;
    }

    if (!isPasswordCriteriaMet) {
      showNotification('Please meet the password strength requirements.', 'error');
      return;
    }

    if (!confirmPassword) {
      showNotification('Please confirm your new password.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification('New passwords do not match.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      showNotification(res.message || 'Password changed successfully!', 'success');
      onClose();
    } catch (err: any) {
      showNotification(
        formatUserFriendlyError(err, 'Unable to update password. Please verify current password and try again.'),
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        zIndex: 1050,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.1)',
          overflow: 'hidden',
          animation: 'fadeInUp 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.4rem 1.75rem',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #6366F1 0%, #10B981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                color: '#FFF',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                flexShrink: 0,
              }}
            >
              🔑
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Change Password
              </h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                Update your account security credentials
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: '0.45rem 0.75rem',
              color: 'var(--text-subtle)',
              fontSize: '1rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              lineHeight: 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Current Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '0.4rem',
                }}
              >
                Current Password <span style={{ color: '#F87171' }}>*</span>
              </label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="Enter your current password"
              />
            </div>

            {/* New Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '0.4rem',
                }}
              >
                New Password <span style={{ color: '#F87171' }}>*</span>
              </label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                hasError={showPasswordError}
                required
                disabled={isSubmitting}
                placeholder="Enter new strong password"
              />
              {showPasswordError && (
                <div
                  style={{
                    marginTop: '0.45rem',
                    fontSize: '0.78rem',
                    color: '#F87171',
                    lineHeight: 1.4,
                  }}
                >
                  {PASSWORD_ERROR_MESSAGE}
                </div>
              )}
              {newPassword && isPasswordCriteriaMet && (
                <div
                  style={{
                    marginTop: '0.45rem',
                    fontSize: '0.78rem',
                    color: '#34D399',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <span>✓</span> Password meets security criteria
                </div>
              )}
            </div>

            {/* Confirm New Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '0.4rem',
                }}
              >
                Confirm New Password <span style={{ color: '#F87171' }}>*</span>
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="Re-enter new password to confirm"
              />
              {confirmPassword && newPassword && confirmPassword !== newPassword && (
                <div
                  style={{
                    marginTop: '0.45rem',
                    fontSize: '0.78rem',
                    color: '#F87171',
                  }}
                >
                  Passwords do not match.
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '1.75rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-secondary"
              style={{
                padding: '0.55rem 1.25rem',
                fontSize: '0.88rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (newPassword ? !isPasswordCriteriaMet : false)}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.35rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  <span
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#FFF',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                  Updating...
                </>
              ) : (
                <>
                  <span>🔒</span> Update Password
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
