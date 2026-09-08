'use client';

import React from 'react';
import { User } from '../types/customer';
import { removeAuthToken } from '../lib/api';

interface NavbarProps {
  user: User | null;
  activeTab: 'customers' | 'admin_users';
  onTabChange: (tab: 'customers' | 'admin_users') => void;
  onLogout: () => void;
}

export default function Navbar({ user, activeTab, onTabChange, onLogout }: NavbarProps) {
  const handleLogout = () => {
    removeAuthToken();
    onLogout();
  };

  const isAdmin = user?.role === 'admin';

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
        {/* Brand Logo & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '1.2rem',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}>
              CM
            </div>
            <div>
              <h1 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                Customer Hub
              </h1>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="pulse-dot"></span> PostgreSQL RBAC
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          {user && (
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => onTabChange('customers')}
                className={`btn ${activeTab === 'customers' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
              >
                👥 Customer Directory
              </button>

              {isAdmin && (
                <button
                  onClick={() => onTabChange('admin_users')}
                  className={`btn ${activeTab === 'admin_users' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.4rem 0.85rem',
                    background: activeTab === 'admin_users' ? 'linear-gradient(135deg, #818CF8 0%, #C084FC 100%)' : undefined
                  }}
                >
                  👑 Admin User Portal
                </button>
              )}
            </nav>
          )}
        </div>

        {/* User Profile & Actions */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Role Badge */}
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              background: isAdmin ? 'rgba(168, 85, 247, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: isAdmin ? '#C084FC' : '#34D399',
              border: `1px solid ${isAdmin ? 'rgba(168, 85, 247, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
            }}>
              {isAdmin ? '👑 ADMIN' : '👤 USER'}
            </span>

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
                background: isAdmin ? '#818CF8' : 'var(--primary)',
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
