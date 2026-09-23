'use client';

import React, { useState } from 'react';
import { User } from '../types/employee';
import { formatPhoneNumberDisplay } from '../lib/phoneUtils';

interface EmployeeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: User | null;
  onEdit: (employee: User) => void;
  onSendEmail?: (employee: User) => void;
  isSendingEmail?: boolean;
  onCopySetupLink?: (employee: User) => void;
  isCopyingSetup?: boolean;
}

export default function EmployeeDetailModal({
  isOpen,
  onClose,
  employee,
  onEdit,
  onSendEmail,
  isSendingEmail = false,
  onCopySetupLink,
  isCopyingSetup = false,
}: EmployeeDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'career' | 'education'>('overview');

  if (!isOpen || !employee) return null;

  const renderPills = (text: string | null | undefined, emptyLabel: string, color: string = '#818CF8') => {
    if (!text || !text.trim()) {
      return (
        <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
          {emptyLabel}
        </span>
      );
    }
    const items = text.split(/[,\n•;]+/).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) {
      return (
        <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
          {emptyLabel}
        </span>
      );
    }
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.35rem' }}>
        {items.map((item, idx) => (
          <span
            key={idx}
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: `${color}18`,
              color: color,
              border: `1px solid ${color}35`,
            }}
          >
            {item}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '640px', width: '100%', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.06) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span
              style={{
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
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: employee.is_active ? '#34D399' : '#F87171',
                }}
              />
              {employee.is_active ? 'Active' : 'Inactive'}
            </span>

            <span
              style={{
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
              }}
            >
              {employee.is_setup_complete ? '✓ Setup Complete' : '⏳ Setup Pending'}
            </span>

            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '2px 7px',
                borderRadius: '6px',
                color: 'var(--text-subtle)',
              }}
            >
              STAFF
            </span>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Employee Banner */}
        <div style={{ padding: '1.25rem 1.5rem 0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: '700',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              }}
            >
              {employee.full_name ? employee.full_name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                {employee.full_name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                {employee.job_title || 'Employee'} &bull; {employee.department || 'General'}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '0.35rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginTop: '0.75rem',
            }}
          >
            {[
              { key: 'overview', label: '🏢 Overview & Contact' },
              { key: 'career', label: '💼 Career & Experience' },
              { key: 'education', label: '🎓 Education & Certs' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    border: isActive ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                    borderBottom: 'none',
                    borderRadius: '6px 6px 0 0',
                    padding: '0.5rem 0.9rem',
                    color: isActive ? '#A5B4FC' : 'var(--text-subtle)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.5rem', maxHeight: '55vh', overflowY: 'auto' }}>
          {/* TAB 1: OVERVIEW & CONTACT */}
          {activeTab === 'overview' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.9rem',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '1.1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Email Address</span>
                <a href={`mailto:${employee.email}`} style={{ fontSize: '0.88rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}>
                  {employee.email}
                </a>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Phone Number</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                  {employee.phone ? formatPhoneNumberDisplay(employee.phone) : 'None provided'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Department</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                  {employee.department || 'General'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Job Title</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                  {employee.job_title || 'Employee'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Company / Org</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                  {employee.company || '—'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Address / Location</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                  {employee.address || '—'}
                </span>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Emergency Contact</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                  {employee.emergency_contact || 'None provided'}
                </span>
              </div>

              {employee.notes && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Internal Notes</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                    {employee.notes}
                  </span>
                </div>
              )}

              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Public Identifier</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {employee.public_id || `#${employee.id}`}
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: CAREER & EXPERIENCE */}
          {activeTab === 'career' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '1.1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Total Years of Experience</span>
                <span style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: 600 }}>
                  {employee.experience_years || 'Not specified'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Previously Worked Companies</span>
                {renderPills(employee.previous_companies, 'No previous companies listed', '#38BDF8')}
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Previous Roles & Designations</span>
                {renderPills(employee.previous_roles, 'No previous roles listed', '#A78BFA')}
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Core Skills & Technologies</span>
                {renderPills(employee.skills, 'No skills recorded', '#34D399')}
              </div>
            </div>
          )}

          {/* TAB 3: EDUCATION & CERTIFICATIONS */}
          {activeTab === 'education' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '1.1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Highest Qualification / Degrees</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                  {employee.education || 'No academic qualification listed'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>Professional Certifications & Licenses</span>
                {renderPills(employee.certifications, 'No certifications listed', '#FBBF24')}
              </div>
            </div>
          )}

          {/* Metadata Footer */}
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '1rem',
            }}
          >
            <span>Account ID: #{employee.id}</span>
            <span>Created: {employee.created_at ? new Date(employee.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</span>
          </div>
        </div>

        {/* Action buttons footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(0, 0, 0, 0.15)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {!employee.is_setup_complete && employee.is_active && onCopySetupLink && (
              <button
                type="button"
                onClick={() => onCopySetupLink(employee)}
                disabled={isCopyingSetup}
                className="btn"
                style={{
                  fontSize: '0.85rem',
                  padding: '0.45rem 0.9rem',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  color: '#67E8F9',
                }}
              >
                {isCopyingSetup ? 'Copying...' : '🔗 Copy Setup Link'}
              </button>
            )}

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
                  color: '#A5B4FC',
                }}
              >
                {isSendingEmail ? 'Sending...' : '✉️ Send Login Email'}
              </button>
            )}
          </div>

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
              ✏️ Edit Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
