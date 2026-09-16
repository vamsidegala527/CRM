'use client';

import React from 'react';
import { Customer } from '../types/customer';

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onEdit: (customer: Customer) => void;
}

export default function CustomerDetailModal({
  isOpen,
  onClose,
  customer,
  onEdit,
}: CustomerDetailModalProps) {
  if (!isOpen || !customer) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return 'badge-active';
      case 'Lead': return 'badge-lead';
      case 'Prospect': return 'badge-prospect';
      default: return 'badge-inactive';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`badge ${getStatusBadge(customer.status)}`}>
              {customer.status}
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-subtle)',
                fontFamily: 'monospace',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
              title={`Public ID: ${customer.public_id || customer.id}`}
            >
              UUID: {customer.public_id ? customer.public_id.slice(0, 8) + '...' : `#${customer.id}`}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: '700'
            }}>
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                {customer.name}
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                {customer.company || 'Individual Client'}
              </p>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            marginBottom: '1.25rem'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Email Address</span>
              <a href={`mailto:${customer.email}`} style={{ fontSize: '0.9rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}>
                {customer.email}
              </a>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Phone</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {customer.phone || 'N/A'}
              </span>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Address</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {customer.address || 'No address specified'}
              </span>
            </div>
          </div>

          {customer.notes && (
            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block', marginBottom: '0.35rem' }}>
                Internal Notes
              </span>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                lineHeight: '1.5'
              }}>
                {customer.notes}
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Created: {new Date(customer.created_at).toLocaleDateString()}</span>
            <span>Last Updated: {new Date(customer.updated_at).toLocaleDateString()}</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)'
          }}>
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
            <button
              onClick={() => {
                onClose();
                onEdit(customer);
              }}
              className="btn btn-primary"
            >
              Edit Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
