'use client';

import React from 'react';
import { User } from '../types/employee';
import { removeAuthToken } from '../lib/api';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
}

export default function Navbar({ user, onLogout }: NavbarProps) {
  const handleLogout = () => {
    removeAuthToken();
    onLogout();
  };

  return (
    <header style={{
      borderBottom: '1px solid var(--border-color)',
      background: 'rgba(11, 15, 25, 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div className="container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '70px'
      }}>
        {/* Brand Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            background: user?.role === 'employee'
              ? 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)'
              : 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '1.1rem',
            color: '#FFFFFF',
            boxShadow: user?.role === 'employee'
              ? '0 4px 12px rgba(16, 185, 129, 0.3)'
              : '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}>
            {user?.role === 'employee' ? 'EM' : 'HR'}
          </div>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              {user?.role === 'employee' ? 'Employee Portal' : 'HR & Employee Management Portal'}
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="pulse-dot"></span> {user?.role === 'employee' ? 'Self-Service Portal' : 'HR/Admin Workspace'}
            </span>
          </div>
        </div>

        {/* User Profile & Actions */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}>
              <span style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: user.role === 'employee' ? '#10B981' : '#818CF8',
                color: '#FFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: '700'
              }}>
                {user.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
              </span>
              <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>
                {user.full_name || user.email}
              </span>
              <span style={{
                background: user.role === 'employee' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                color: user.role === 'employee' ? '#34D399' : '#A5B4FC',
                border: user.role === 'employee' ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: '12px',
                padding: '1px 8px',
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {user.role === 'employee' ? 'Employee' : 'HR/Admin'}
              </span>
            </div>

            <button onClick={handleLogout} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
