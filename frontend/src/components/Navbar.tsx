'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types/employee';
import { removeAuthToken } from '../lib/api';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onOpenCompanyProfile?: () => void;
  onChangePassword?: () => void;
}

export default function Navbar({ user, onLogout, onOpenCompanyProfile, onChangePassword }: NavbarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    setIsDropdownOpen(false);
    removeAuthToken();
    onLogout();
  };

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const avatarInitial = user?.full_name?.trim()
    ? user.full_name.trim().charAt(0).toUpperCase()
    : (user?.email?.charAt(0).toUpperCase() || 'U');

  const roleGradient = user?.role === 'employee'
    ? 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)'
    : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)';

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

        {/* User Profile Trigger & Dropdown */}
        {user && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              id="profile-dropdown-trigger"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isDropdownOpen}
              aria-label="User profile menu"
              style={{
                background: isDropdownOpen ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isDropdownOpen ? 'var(--border-highlight, rgba(99, 102, 241, 0.5))' : 'var(--border-color)'}`,
                padding: '0.4rem 0.8rem 0.4rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
                color: 'var(--text-main)',
                outline: 'none',
                boxShadow: isDropdownOpen ? '0 0 14px rgba(99, 102, 241, 0.25)' : 'none'
              }}
            >
              {/* Avatar Initial Circle */}
              <span style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: roleGradient,
                color: '#FFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: '700',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)'
              }}>
                {avatarInitial}
              </span>

              {/* Profile Label */}
              <span style={{
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'var(--text-main)',
                letterSpacing: '0.01em'
              }}>
                Profile
              </span>

              {/* Animated Dropdown Chevron */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  color: 'var(--text-muted)',
                  transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {/* Dropdown Popover Card */}
            {isDropdownOpen && (
              <div
                id="profile-dropdown-menu"
                role="menu"
                aria-orientation="vertical"
                className="profile-dropdown-menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 10px)',
                  width: '290px',
                  background: '#131B2E',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5), 0 0 24px rgba(99, 102, 241, 0.15)',
                  padding: '0.75rem',
                  zIndex: 100,
                  backdropFilter: 'blur(20px)'
                }}
              >
                {/* 1. First: Name of the logged in user & Account Details */}
                <div style={{
                  padding: '0.75rem 0.85rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  marginBottom: '0.6rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: roleGradient,
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      fontWeight: '800',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                    }}>
                      {avatarInitial}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontWeight: '700',
                        fontSize: '0.95rem',
                        color: 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {user.full_name || 'User'}
                      </div>
                      <div style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {/* Role Tag */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.45rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                  }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Account Role
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '0.15rem 0.55rem',
                      borderRadius: 'var(--radius-full)',
                      background: user.role === 'employee' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: user.role === 'employee' ? '#34D399' : '#A5B4FC',
                      border: `1px solid ${user.role === 'employee' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                    }}>
                      {user.role === 'employee' ? 'Employee' : 'HR Admin'}
                    </span>
                  </div>
                </div>

                {/* 2. Menu Options: Company Profile and Logout */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {onOpenCompanyProfile && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenCompanyProfile();
                      }}
                      className="profile-dropdown-item"
                    >
                      <span style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#818CF8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 21h18"></path>
                          <path d="M5 21V7l8-4v18"></path>
                          <path d="M19 21V11l-6-4"></path>
                          <path d="M9 9h1"></path>
                          <path d="M9 13h1"></path>
                          <path d="M9 17h1"></path>
                        </svg>
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Company Profile</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>View organization details</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-subtle)' }}>
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  )}

                  {onChangePassword && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onChangePassword();
                      }}
                      className="profile-dropdown-item"
                    >
                      <span style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34D399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Change Password</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Update account password</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-subtle)' }}>
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  )}

                  {/* Divider */}
                  <div style={{
                    height: '1px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    margin: '0.35rem 0'
                  }} />

                  {/* Logout Action */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="profile-dropdown-item danger"
                  >
                    <span style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(244, 63, 94, 0.15)',
                      color: '#F87171',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Logout</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(248, 113, 113, 0.8)' }}>Sign out of your session</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

