'use client';

import React, { useState, useEffect } from 'react';
import { Customer, CustomerInput } from '../types/customer';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomerInput) => Promise<void>;
  customer?: Customer | null;
  isSubmitting: boolean;
}

export default function CustomerModal({
  isOpen,
  onClose,
  onSubmit,
  customer,
  isSubmitting,
}: CustomerModalProps) {
  const [formData, setFormData] = useState<CustomerInput>({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    status: 'Active',
    notes: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        company: customer.company || '',
        address: customer.address || '',
        status: customer.status || 'Active',
        notes: customer.notes || '',
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        address: '',
        status: 'Active',
        notes: '',
      });
    }
    setFieldErrors({});
    setGeneralError(null);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const validateField = (name: string, value: string): string | null => {
    const trimmed = value.trim();

    if (name === 'name') {
      if (!trimmed) return 'Full Name is required.';
      if (trimmed.length < 2) return 'Full Name must be at least 2 characters long.';
      if (trimmed.length > 100) return 'Full Name cannot exceed 100 characters.';
      if (!/^[a-zA-Z\s\-\'\.\,]+$/.test(trimmed)) {
        return 'Full Name can only contain letters, spaces, hyphens, apostrophes, and periods.';
      }
    }

    if (name === 'email') {
      if (!trimmed) return 'Email Address is required.';
      if (trimmed.length > 255) return 'Email Address cannot exceed 255 characters.';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) return 'Please enter a valid email address (e.g. name@domain.com).';
    }

    if (name === 'phone' && value) {
      if (!trimmed) return null;
      if (!/^\+?[0-9\s\-\(\)\.]{7,25}$/.test(trimmed)) {
        return 'Invalid phone format. Only digits, spaces, +, -, (), and dots allowed.';
      }
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return `Phone number must contain between 7 and 15 digits (found ${digits.length}).`;
      }
    }

    if (name === 'company' && value) {
      if (!trimmed) return 'Company Name cannot consist only of spaces.';
      if (trimmed.length > 100) return 'Company Name cannot exceed 100 characters.';
    }

    if (name === 'status') {
      const validStatuses = ['Active', 'Lead', 'Prospect', 'Inactive', 'Active Customer', 'Sales Lead'];
      if (!trimmed || !validStatuses.includes(trimmed)) {
        return 'Customer Status must be one of: Active Customer, Sales Lead, Prospect, or Inactive.';
      }
    }

    if (['notes', 'address', 'company'].includes(name) && value) {
      if (/<script|javascript:|on[a-z]+\s*=/i.test(value)) {
        return 'HTML tags, scripts, and event handlers are not allowed.';
      }
    }

    if (name === 'address' && value) {
      if (trimmed.length > 300) return 'Address cannot exceed 300 characters.';
    }

    if (name === 'notes' && value) {
      if (trimmed.length > 1000) return 'Notes & Details cannot exceed 1000 characters.';
    }

    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Validate on the fly
    const errorMsg = validateField(name, value);
    setFieldErrors((prev) => ({
      ...prev,
      [name]: errorMsg || '',
    }));
  };

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};

    const nameErr = validateField('name', formData.name);
    if (nameErr) errors.name = nameErr;

    const emailErr = validateField('email', formData.email);
    if (emailErr) errors.email = emailErr;

    if (formData.phone) {
      const phoneErr = validateField('phone', formData.phone);
      if (phoneErr) errors.phone = phoneErr;
    }

    if (formData.company) {
      const companyErr = validateField('company', formData.company);
      if (companyErr) errors.company = companyErr;
    }

    const statusErr = validateField('status', formData.status || 'Active');
    if (statusErr) errors.status = statusErr;

    if (formData.address) {
      const addressErr = validateField('address', formData.address);
      if (addressErr) errors.address = addressErr;
    }

    if (formData.notes) {
      const notesErr = validateField('notes', formData.notes);
      if (notesErr) errors.notes = notesErr;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateAll()) {
      setGeneralError('Please fix the validation errors below before saving.');
      return;
    }

    try {
      await onSubmit({
        ...formData,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone ? formData.phone.trim() : undefined,
        company: formData.company ? formData.company.trim() : undefined,
        address: formData.address ? formData.address.trim() : undefined,
        notes: formData.notes ? formData.notes.trim() : undefined,
      });
      onClose();
    } catch (err: any) {
      if (err.message) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Failed to save customer record. Please check your inputs.');
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Fixed Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            {customer ? 'Edit Customer Information' : 'Add New Customer'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Scrollable Middle Form Body */}
          <div className="modal-body-scroll" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {generalError && (
              <div style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#F87171',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                marginBottom: '1.25rem'
              }}>
                {generalError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  className="form-control"
                  placeholder="e.g. Jane Doe"
                  value={formData.name}
                  onChange={handleChange}
                  style={fieldErrors.name ? { borderColor: '#F87171' } : {}}
                />
                {fieldErrors.name && (
                  <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.name}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="text"
                  name="email"
                  className="form-control"
                  placeholder="e.g. jane@company.com"
                  value={formData.email}
                  onChange={handleChange}
                  style={fieldErrors.email ? { borderColor: '#F87171' } : {}}
                />
                {fieldErrors.email && (
                  <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.email}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  className="form-control"
                  placeholder="e.g. +1 (555) 019-2834"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  style={fieldErrors.phone ? { borderColor: '#F87171' } : {}}
                />
                {fieldErrors.phone && (
                  <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.phone}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  name="company"
                  className="form-control"
                  placeholder="e.g. Acme Corp"
                  value={formData.company || ''}
                  onChange={handleChange}
                  style={fieldErrors.company ? { borderColor: '#F87171' } : {}}
                />
                {fieldErrors.company && (
                  <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {fieldErrors.company}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Customer Status *</label>
              <select
                name="status"
                className="form-control"
                value={formData.status || 'Active'}
                onChange={handleChange}
                style={fieldErrors.status ? { borderColor: '#F87171' } : {}}
              >
                <option value="Active">Active Customer</option>
                <option value="Lead">Sales Lead</option>
                <option value="Prospect">Prospect</option>
                <option value="Inactive">Inactive</option>
              </select>
              {fieldErrors.status && (
                <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.status}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Address</label>
              <input
                type="text"
                name="address"
                className="form-control"
                placeholder="e.g. 100 Main St, Suite 400, New York, NY"
                value={formData.address || ''}
                onChange={handleChange}
                style={fieldErrors.address ? { borderColor: '#F87171' } : {}}
              />
              {fieldErrors.address && (
                <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.address}
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notes & Details</label>
              <textarea
                name="notes"
                className="form-control"
                rows={3}
                placeholder="Add key observations, contract terms, or preferences..."
                value={formData.notes || ''}
                onChange={handleChange}
                style={fieldErrors.notes ? { borderColor: '#F87171' } : {}}
              />
              {fieldErrors.notes && (
                <div style={{ color: '#F87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {fieldErrors.notes}
                </div>
              )}
            </div>
          </div>

          {/* Fixed Footer Action Buttons */}
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            background: '#131B2E',
            flexShrink: 0
          }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? 'Saving...' : customer ? 'Update Customer' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
