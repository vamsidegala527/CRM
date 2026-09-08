'use client';

import React from 'react';
import { Customer } from '../types/customer';

interface CustomerListProps {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  onView: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  isLoading: boolean;
}

export default function CustomerList({
  customers,
  total,
  page,
  limit,
  onPageChange,
  onView,
  onEdit,
  onDelete,
  isLoading,
}: CustomerListProps) {
  const totalPages = Math.ceil(total / limit) || 1;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return 'badge-active';
      case 'Lead': return 'badge-lead';
      case 'Prospect': return 'badge-prospect';
      default: return 'badge-inactive';
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        Fetching customer records from PostgreSQL...
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
        <div style={{
          fontSize: '2.5rem',
          marginBottom: '1rem',
          opacity: 0.5
        }}>
          &#128101;
        </div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
          No Customers Found
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
          No customer records matched your query or filter criteria. Try clearing search filters or add a new customer.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-subtle)'
            }}>
              <th style={{ padding: '1rem 1.25rem' }}>Customer</th>
              <th style={{ padding: '1rem 1.25rem' }}>Contact Info</th>
              <th style={{ padding: '1rem 1.25rem' }}>Company</th>
              <th style={{ padding: '1rem 1.25rem' }}>Status</th>
              <th style={{ padding: '1rem 1.25rem' }}>Added Date</th>
              <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((cust) => (
              <tr
                key={cust.id}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  transition: 'var(--transition-fast)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Name */}
                <td style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#818CF8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '0.875rem'
                    }}>
                      {cust.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div
                        onClick={() => onView(cust)}
                        style={{
                          fontWeight: '600',
                          fontSize: '0.9rem',
                          color: 'var(--text-main)',
                          cursor: 'pointer'
                        }}
                      >
                        {cust.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        ID #{cust.id}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Email & Phone */}
                <td style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{cust.email}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{cust.phone || 'No phone'}</div>
                </td>

                {/* Company */}
                <td style={{ padding: '1rem 1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {cust.company || '—'}
                </td>

                {/* Status */}
                <td style={{ padding: '1rem 1.25rem' }}>
                  <span className={`badge ${getStatusBadge(cust.status)}`}>
                    {cust.status}
                  </span>
                </td>

                {/* Date */}
                <td style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  {new Date(cust.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>

                {/* Actions */}
                <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    <button
                      onClick={() => onView(cust)}
                      className="btn btn-secondary btn-icon"
                      title="View Details"
                    >
                      &#128065;
                    </button>
                    <button
                      onClick={() => onEdit(cust)}
                      className="btn btn-secondary btn-icon"
                      title="Edit Customer"
                    >
                      &#9998;
                    </button>
                    <button
                      onClick={() => onDelete(cust)}
                      className="btn btn-danger btn-icon"
                      title="Delete Customer"
                    >
                      &#128465;
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{
        padding: '0.85rem 1.25rem',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0, 0, 0, 0.2)',
        fontSize: '0.85rem',
        color: 'var(--text-subtle)'
      }}>
        <div>
          Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)} of {total} customers
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
          >
            &laquo; Previous
          </button>
          <span style={{ padding: '0 0.5rem', fontWeight: '600', color: 'var(--text-main)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
          >
            Next &raquo;
          </button>
        </div>
      </div>
    </div>
  );
}
