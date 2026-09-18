'use client';

import React from 'react';
import { User } from '../types/employee';

interface EmployeeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: User | null;
  onEdit: (employee: User) => void;
  onSendEmail?: (employee: User) => void;
  isSendingEmail?: boolean;
}

export default function EmployeeDetailModal({
  isOpen,
  onClose,
  employee,
  onEdit,
  onSendEmail,
  isSendingEmail = false,
}: EmployeeDetailModalProps) {
  if (!isOpen || !employee) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header bar */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.65rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: employee.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: employee.is_active ? '#34D399' : '#F87171',
              border: employee.is_active ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: employee.is_active ? '#34D399' : '#F87171'
              }} />
              {employee.is_active ? 'Active' : 'Inactive'}
            </span>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.65rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: employee.is_setup_complete ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: employee.is_setup_complete ? '#818CF8' : '#FBBF24',
              border: employee.is_setup_complete ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
            }}>
              {employee.is_setup_complete ? '✓ Setup Complete' : '⏳ Setup Pending'}
            </span>

            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '2px 7px',
              borderRadius: '6px',
              color: 'var(--text-subtle)'
            }}>
              STAFF
            </span>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: '700',
              flexShrink: 0
            }}>
              {employee.full_name ? employee.full_name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                {employee.full_name}
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                {employee.job_title || 'Employee'} &bull; {employee.department || 'General'}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '1.1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            marginBottom: '1.25rem'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Email Address</span>
              <a href={`mailto:${employee.email}`} style={{ fontSize: '0.9rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}>
                {employee.email}
              </a>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Phone</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {employee.phone || 'None provided'}
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Department</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {employee.department || 'General'}
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Job Title</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {employee.job_title || 'Employee'}
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Company / Org</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {employee.company || '—'}
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Address / Location</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {employee.address || '—'}
              </span>
            </div>

            {employee.notes && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Internal Notes</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                  {employee.notes}
                </span>
              </div>
            )}

            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block' }}>Public Identifier</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {employee.public_id || `#${employee.id}`}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>Account ID: #{employee.id}</span>
            <span>Created: {employee.created_at ? new Date(employee.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</span>
          </div>

          {/* Action buttons footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
            flexWrap: 'wrap'
          }}>
            {onSendEmail && employee.is_active && (
              <button
                type="button"
                onClick={() => onSendEmail(employee)}
                disabled={isSendingEmail}
                className="btn"
                style={{
                  fontSize: '0.85rem',
                  padding: '0.45rem 0.9rem',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  color: '#A5B4FC'
                }}
              >
                {isSendingEmail ? 'Sending...' : '✉️ Send Login Email'}
              </button>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
              <button onClick={onClose} className="btn btn-secondary">
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                  onEdit(employee);
                }}
                className="btn btn-primary"
              >
                Edit Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
