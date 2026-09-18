'use client';

import React, { useState, useEffect } from 'react';
import { User } from '../types/employee';

interface EmployeeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: User | null;
  onConfirm: (employee: User, permanent: boolean, confirmed: boolean) => Promise<void>;
}

export default function EmployeeDeleteModal({
  isOpen,
  onClose,
  employee,
  onConfirm,
}: EmployeeDeleteModalProps) {
  const [deleteMode, setDeleteMode] = useState<'deactivate' | 'permanent'>('deactivate');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDeleteMode('deactivate');
      setIsConfirmed(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteMode === 'permanent' && !isConfirmed) {
      setErrorMessage('You must confirm permanent deletion by checking the confirmation box.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await onConfirm(employee, deleteMode === 'permanent', deleteMode === 'permanent' ? isConfirmed : false);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Operation failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Manage Employee Access
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {errorMessage && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#F87171',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '1rem'
            }}>
              {errorMessage}
            </div>
          )}

          <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', margin: '0 0 1.25rem' }}>
            Choose an action for <strong>{employee.full_name}</strong> ({employee.email}):
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {/* Option 1: Soft Deactivate (Default & Recommended) */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: deleteMode === 'deactivate' ? '1px solid #10B981' : '1px solid var(--border-color)',
              background: deleteMode === 'deactivate' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}>
              <input
                type="radio"
                name="deleteAction"
                checked={deleteMode === 'deactivate'}
                onChange={() => {
                  setDeleteMode('deactivate');
                  setIsConfirmed(false);
                }}
                style={{ marginTop: '0.25rem', accentColor: '#10B981' }}
              />
              <div>
                <div style={{ fontWeight: 600, color: deleteMode === 'deactivate' ? '#34D399' : 'var(--text-main)', fontSize: '0.9rem' }}>
                  Deactivate Account (Recommended)
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: '1.45' }}>
                  Revokes all active sessions immediately and prevents login. The employee remains in the directory under &quot;Inactive&quot; and can be reactivated anytime with data intact.
                </div>
              </div>
            </label>

            {/* Option 2: Permanent Delete */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: deleteMode === 'permanent' ? '1px solid #F87171' : '1px solid var(--border-color)',
              background: deleteMode === 'permanent' ? 'rgba(244, 63, 94, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}>
              <input
                type="radio"
                name="deleteAction"
                checked={deleteMode === 'permanent'}
                onChange={() => setDeleteMode('permanent')}
                style={{ marginTop: '0.25rem', accentColor: '#F87171' }}
              />
              <div>
                <div style={{ fontWeight: 600, color: deleteMode === 'permanent' ? '#F87171' : 'var(--text-main)', fontSize: '0.9rem' }}>
                  Permanent Delete (Irreversible)
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: '1.45' }}>
                  Permanently deletes the employee record from the database. Blocked automatically if this employee is linked to any historical records.
                </div>
              </div>
            </label>
          </div>

          {/* Explicit Confirmation Checkbox for Permanent Deletion */}
          {deleteMode === 'permanent' && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem'
            }}>
              <input
                type="checkbox"
                id="permanent_confirmed_checkbox"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                style={{ marginTop: '0.2rem', accentColor: '#EF4444', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="permanent_confirmed_checkbox" style={{ fontSize: '0.825rem', color: '#FCA5A5', cursor: 'pointer', lineHeight: '1.4' }}>
                <strong>Confirm Deletion:</strong> I understand that permanent deletion cannot be undone, and I explicitly confirm this action.
              </label>
            </div>
          )}

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing || (deleteMode === 'permanent' && !isConfirmed)}
              className="btn"
              style={{
                background: deleteMode === 'permanent'
                  ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                  : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#FFF',
                fontWeight: 600,
                padding: '0.5rem 1.1rem',
                opacity: deleteMode === 'permanent' && !isConfirmed ? 0.5 : 1,
                cursor: deleteMode === 'permanent' && !isConfirmed ? 'not-allowed' : 'pointer'
              }}
            >
              {isProcessing
                ? 'Processing...'
                : deleteMode === 'permanent'
                ? 'Permanently Delete'
                : 'Confirm Deactivation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
