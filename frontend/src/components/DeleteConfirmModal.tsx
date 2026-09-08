'use client';

import React from 'react';
import { Customer } from '../types/customer';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  customer: Customer | null;
  isDeleting: boolean;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  customer,
  isDeleting,
}: DeleteConfirmModalProps) {
  if (!isOpen || !customer) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(244, 63, 94, 0.15)',
            color: '#F87171',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '1rem'
          }}>
            &#9888;
          </div>

          <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Delete Customer?
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '1.5rem' }}>
            Are you sure you want to delete customer <strong style={{ color: 'var(--text-main)' }}>{customer.name}</strong> ({customer.email})? This action will remove the record from PostgreSQL permanently.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={onClose} disabled={isDeleting} className="btn btn-secondary" style={{ flex: 1 }}>
              Cancel
            </button>
            <button onClick={onConfirm} disabled={isDeleting} className="btn btn-danger" style={{ flex: 1 }}>
              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
