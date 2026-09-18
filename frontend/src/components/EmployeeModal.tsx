'use client';

import React, { useState, useEffect } from 'react';
import { User, EmployeeCreateInput, EmployeeUpdateInput } from '../types/employee';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeCreateInput | EmployeeUpdateInput) => Promise<void>;
  employee: User | null;
  isSubmitting: boolean;
}

export default function EmployeeModal({
  isOpen,
  onClose,
  onSubmit,
  employee,
  isSubmitting,
}: EmployeeModalProps) {
  const isEdit = Boolean(employee);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (employee) {
      setFullName(employee.full_name || '');
      setEmail(employee.email || '');
      setDepartment(employee.department || '');
      setJobTitle(employee.job_title || '');
      setCompany(employee.company || '');
      setAddress(employee.address || '');
      setPhone(employee.phone || '');
      setNotes(employee.notes || '');
      setIsActive(employee.is_active ?? true);
    } else {
      setFullName('');
      setEmail('');
      setDepartment('');
      setJobTitle('');
      setCompany('');
      setAddress('');
      setPhone('');
      setNotes('');
      setIsActive(true);
    }
    setError(null);
  }, [employee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    if (!isEdit && !email.trim()) {
      setError('Email address is required.');
      return;
    }

    try {
      if (isEdit) {
        await onSubmit({
          full_name: fullName.trim(),
          department: department.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          company: company.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          is_active: isActive,
        });
      } else {
        await onSubmit({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          department: department.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          company: company.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save employee.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '520px',
        width: '100%',
        padding: '2rem',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem' }}>
              {isEdit ? 'Edit Employee' : 'Add New Employee'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', margin: 0 }}>
              {isEdit
                ? 'Update employee profile and active status.'
                : 'Enter employee details. An invitation setup email will be dispatched.'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-subtle)',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer'
            }}
          >
            &times;
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            color: '#FCA5A5',
            fontSize: '0.85rem',
            marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Full Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              Full Name *
            </label>
            <input
              type="text"
              className="form-control"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              Email Address * {isEdit && <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>(Read-only)</span>}
            </label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex.morgan@company.com"
              required={!isEdit}
              disabled={isEdit}
              style={{ opacity: isEdit ? 0.6 : 1 }}
            />
          </div>

          {/* Department & Job Title */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Department
              </label>
              <input
                type="text"
                className="form-control"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Job Title
              </label>
              <input
                type="text"
                className="form-control"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer"
              />
            </div>
          </div>

          {/* Phone & Company */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Phone Number
              </label>
              <input
                type="tel"
                className="form-control"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Company / Organization
              </label>
              <input
                type="text"
                className="form-control"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              Address / Location
            </label>
            <input
              type="text"
              className="form-control"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Tech Blvd, Suite 400"
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              Internal Notes
            </label>
            <textarea
              className="form-control"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes or background for HR administration..."
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Active Status (Only in Edit mode) */}
          {isEdit && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <input
                type="checkbox"
                id="is_active_checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="is_active_checkbox" style={{ fontSize: '0.85rem', color: 'var(--text-main)', cursor: 'pointer', userSelect: 'none' }}>
                <strong>Active Account</strong>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                  Unchecking deactivates the employee and revokes active sessions immediately.
                </span>
              </label>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (isEdit ? 'Saving Changes...' : 'Creating Employee...')
                : (isEdit ? 'Save Changes' : 'Create Employee')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
