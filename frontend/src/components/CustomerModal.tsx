'use client';

import React, { useState, useEffect } from 'react';
import { Customer, CustomerInput, CustomerStatus } from '../types/customer';

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

  const [error, setError] = useState<string | null>(null);

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
    setError(null);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and Email are required fields.');
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save customer record.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
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

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#F87171',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem'
            }}>
              {error}
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
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                name="email"
                className="form-control"
                placeholder="e.g. jane@company.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
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
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input
                type="text"
                name="company"
                className="form-control"
                placeholder="e.g. Acme Corp"
                value={formData.company}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Customer Status</label>
            <select
              name="status"
              className="form-control"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="Active">Active Customer</option>
              <option value="Lead">Sales Lead</option>
              <option value="Prospect">Prospect</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Address</label>
            <input
              type="text"
              name="address"
              className="form-control"
              placeholder="e.g. 100 Main St, Suite 400, New York, NY"
              value={formData.address}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes & Details</label>
            <textarea
              name="notes"
              className="form-control"
              rows={3}
              placeholder="Add key observations, contract terms, or preferences..."
              value={formData.notes}
              onChange={handleChange}
            />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)'
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
