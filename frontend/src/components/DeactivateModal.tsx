'use client';

import React, { useEffect } from 'react';
import { User } from '../types/employee';

interface DeactivateModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: User | null;
  onConfirm: (employee: User) => Promise<void>;
  isProcessing?: boolean;
}

export default function DeactivateModal({
  isOpen,
  onClose,
  employee,
  onConfirm,
  isProcessing = false,
}: DeactivateModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen || !employee) return null;

  const handleConfirmClick = async () => {
    if (isProcessing) return;
    await onConfirm(employee);
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isProcessing) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 16, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        zIndex: 9999,
        animation: 'fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        className="modal-content glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 1px rgba(255, 255, 255, 0.1) inset',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header with amber warning accent */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.05) 100%)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                color: '#FBBF24',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.2)',
              }}
            >
              ⏸️
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#F8FAFC' }}>
                Deactivate Employee
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>
                Suspend account access & active sessions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '1.35rem',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              padding: '0.2rem',
              lineHeight: 1,
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Employee Card summary */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              padding: '0.9rem 1rem',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              }}
            >
              {employee.full_name ? employee.full_name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {employee.full_name}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {employee.email}
              </div>
              {(employee.department || employee.job_title) && (
                <div style={{ fontSize: '0.72rem', color: '#A5B4FC', marginTop: '0.2rem' }}>
                  {employee.department} {employee.job_title ? `• ${employee.job_title}` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Warning explanation box */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '10px',
              fontSize: '0.835rem',
              color: '#FDE68A',
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
            }}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1.2 }}>⚠️</span>
            <div>
              Are you sure you want to deactivate <strong>{employee.full_name}</strong>? Their active login sessions will be revoked immediately and they will be prevented from signing in. All employee records are safely preserved and can be reactivated anytime.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="btn btn-secondary"
            style={{
              padding: '0.65rem 1.25rem',
              fontSize: '0.88rem',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isProcessing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.35rem',
              fontSize: '0.88rem',
              fontWeight: 600,
              color: '#FFFFFF',
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 'var(--radius-sm, 8px)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            {isProcessing ? (
              <>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#FFFFFF',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                Deactivating...
              </>
            ) : (
              <>
                <span>⏸️</span> Deactivate Employee
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
