'use client';

import React from 'react';
import { User } from '../types/employee';
import { formatPhoneNumberDisplay } from '../lib/phoneUtils';

interface EmployeeListProps {
  employees: User[];
  isLoading: boolean;
  onView: (emp: User) => void;
  onEdit: (emp: User) => void;
  onDeactivate: (emp: User) => void;
  onReactivate: (emp: User) => void;
  onDelete: (emp: User) => void;
  onSendEmail: (emp: User) => void;
  sendingEmailId: number | null;
  onCopySetupLink?: (emp: User) => void;
  copyingSetupId?: number | null;
}

export default function EmployeeList({
  employees,
  isLoading,
  onView,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  onSendEmail,
  sendingEmailId,
  onCopySetupLink,
  copyingSetupId,
}: EmployeeListProps) {
  if (isLoading) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-subtle)' }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366F1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 1rem'
        }} />
        Loading employees...
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
          No Employees Found
        </h3>
        <p style={{ color: 'var(--text-subtle)', maxWidth: '420px', margin: '0 auto', fontSize: '0.9rem' }}>
          No employee records match your search query or selected status filter.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(255, 255, 255, 0.02)',
            color: 'var(--text-subtle)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            <th style={{ padding: '1rem 1.25rem' }}>Employee</th>
            <th style={{ padding: '1rem' }}>Department & Role</th>
            <th style={{ padding: '1rem' }}>Phone</th>
            <th style={{ padding: '1rem' }}>Company</th>
            <th style={{ padding: '1rem' }}>Status</th>
            <th style={{ padding: '1rem' }}>Setup Status</th>
            <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => {
            const isSendingThisEmail = sendingEmailId === emp.id;
            return (
              <tr
                key={emp.id}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Employee Name & Email */}
                <td style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0
                    }}>
                      {emp.full_name ? emp.full_name.charAt(0).toUpperCase() : 'E'}
                    </div>
                    <div>
                      <div
                        onClick={() => onView(emp)}
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#34D399')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
                        title="Click to view details"
                      >
                        {emp.full_name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                        {emp.email}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Department & Job Title */}
                <td style={{ padding: '1rem' }}>
                  <div style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                    {emp.job_title || '—'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                    {emp.department || 'General'}
                  </div>
                </td>

                {/* Phone */}
                <td style={{ padding: '1rem', color: 'var(--text-main)' }}>
                  {formatPhoneNumberDisplay(emp.phone)}
                </td>

                {/* Company */}
                <td style={{ padding: '1rem', color: 'var(--text-main)' }}>
                  {emp.company || '—'}
                </td>

                {/* Active Status */}
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: emp.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: emp.is_active ? '#34D399' : '#F87171',
                    border: emp.is_active ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: emp.is_active ? '#34D399' : '#F87171'
                    }} />
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>

                {/* Setup Status */}
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: emp.is_setup_complete ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: emp.is_setup_complete ? '#818CF8' : '#FBBF24',
                    border: emp.is_setup_complete ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                  }}>
                    {emp.is_setup_complete ? '✓ Setup Complete' : '⏳ Setup Pending'}
                  </span>
                </td>

                {/* Actions Column */}
                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {/* View Details */}
                    <button
                      type="button"
                      onClick={() => onView(emp)}
                      className="btn btn-secondary btn-icon"
                      title="View Details"
                    >
                      &#128065;
                    </button>

                    {/* Edit Employee */}
                    <button
                      type="button"
                      onClick={() => onEdit(emp)}
                      className="btn btn-secondary btn-icon"
                      title="Edit Employee"
                    >
                      &#9998;
                    </button>

                    {/* Copy Setup Link (Active when setup is pending) */}
                    {!emp.is_setup_complete && emp.is_active && onCopySetupLink && (
                      <button
                        type="button"
                        onClick={() => onCopySetupLink(emp)}
                        disabled={copyingSetupId === emp.id}
                        className="btn btn-secondary btn-icon"
                        title="Copy Setup Link to Clipboard (Direct link)"
                        style={{
                          color: '#38BDF8',
                          cursor: copyingSetupId === emp.id ? 'wait' : 'pointer'
                        }}
                      >
                        {copyingSetupId === emp.id ? '⌛' : '🔗'}
                      </button>
                    )}

                    {/* Send Login Email */}
                    <button
                      type="button"
                      onClick={() => onSendEmail(emp)}
                      disabled={isSendingThisEmail || !emp.is_active}
                      className="btn btn-secondary btn-icon"
                      title={emp.is_active ? 'Send Setup / Login Link' : 'Cannot send email to inactive employee'}
                      style={{
                        color: emp.is_active ? '#818CF8' : 'var(--text-subtle)',
                        opacity: emp.is_active ? 1 : 0.45,
                        cursor: emp.is_active && !isSendingThisEmail ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {isSendingThisEmail ? '⌛' : '✉️'}
                    </button>

                    {/* Deactivate (if active) OR Reactivate (if inactive) */}
                    {emp.is_active ? (
                      <button
                        type="button"
                        onClick={() => onDeactivate(emp)}
                        className="btn btn-secondary btn-icon"
                        title="Deactivate Account (Soft-delete)"
                        style={{ color: '#FBBF24' }}
                      >
                        ⏸️
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReactivate(emp)}
                        className="btn btn-secondary btn-icon"
                        title="Reactivate Account"
                        style={{ color: '#34D399' }}
                      >
                        ▶️
                      </button>
                    )}

                    {/* Delete (opens confirmation modal for Deactivate vs Permanent Delete) */}
                    <button
                      type="button"
                      onClick={() => onDelete(emp)}
                      className="btn btn-secondary btn-icon"
                      title="Delete Employee..."
                      style={{ color: '#F87171' }}
                    >
                      &#128465;
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
