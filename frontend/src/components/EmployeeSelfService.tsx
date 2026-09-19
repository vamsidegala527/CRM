'use client';

import React, { useState } from 'react';
import { User } from '../types/employee';
import { api, setStoredUser } from '../lib/api';
import { isPasswordValid, PASSWORD_ERROR_MESSAGE } from '../lib/validation';
import PasswordInput from './PasswordInput';

interface EmployeeSelfServiceProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void;
  showNotification: (msg: string, type?: 'success' | 'error') => void;
  onViewCompany?: () => void;
}

export default function EmployeeSelfService({
  user,
  onUserUpdate,
  showNotification,
  onViewCompany,
}: EmployeeSelfServiceProps) {
  // Profile update state
  const [fullName, setFullName] = useState(user.full_name || '');
  const [department, setDepartment] = useState(user.department || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState(user.address || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const isPasswordCriteriaMet = isPasswordValid(newPassword);
  const showPasswordError = (formSubmitted && !isPasswordCriteriaMet) || (passwordTouched && newPassword.length > 0 && !isPasswordCriteriaMet);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      showNotification('Full name cannot be empty.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await api.updateEmployee(user.id, {
        full_name: fullName.trim(),
        department: department.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });

      onUserUpdate(updated);
      setStoredUser(updated);
      showNotification('Profile updated successfully!');
    } catch (err: any) {
      showNotification(err.message || 'Failed to update profile.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);

    if (!currentPassword) {
      showNotification('Please enter your current password.', 'error');
      return;
    }

    if (!isPasswordCriteriaMet) {
      return;
    }

    if (!confirmPassword) {
      showNotification('Please confirm your new password.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification('New passwords do not match.', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      showNotification(res.message || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showNotification(err.message || 'Failed to change password.', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{
        padding: '1.75rem',
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.5rem',
            color: '#FFFFFF',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)'
          }}>
            {user.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                {user.full_name}
              </h2>
              <span style={{
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34D399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase'
              }}>
                EMPLOYEE
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', margin: 0 }}>
              {user.email} &bull; {user.job_title || 'Employee'} &bull; {user.department || 'General'}
            </p>
          </div>
        </div>
        {/* Our Company Quick Action */}
        {onViewCompany && (
          <button
            type="button"
            onClick={onViewCompany}
            style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '12px',
              padding: '0.65rem 1.2rem',
              color: '#A5B4FC',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
          >
            🏢 Our Company
          </button>
        )}
      </div>

      {/* Two Column Grid: Profile on left, Password on right */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1.5rem'
      }}>
        {/* Profile Card */}
        <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.25rem' }}>👤</span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              My Profile Details
            </h3>
          </div>

          <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Full Name *
              </label>
              <input
                type="text"
                className="form-control"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Email Address <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>(Managed by Admin)</span>
              </label>
              <input
                type="email"
                className="form-control"
                value={user.email}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Department
              </label>
              <input
                type="text"
                className="form-control"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Sales, Marketing"
              />
            </div>

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
                Office / Residential Address
              </label>
              <input
                type="text"
                className="form-control"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 100 Innovation Way, Suite 400"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSavingProfile}
              style={{ marginTop: '0.5rem' }}
            >
              {isSavingProfile ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🔒</span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Change Password
            </h3>
          </div>

          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Current Password *
              </label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="Enter current password"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                New Password *
              </label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                hasError={showPasswordError}
                required
                placeholder="Choose strong new password"
              />
              {showPasswordError && (
                <div
                  style={{
                    marginTop: '0.45rem',
                    fontSize: '0.8rem',
                    color: '#F87171',
                    lineHeight: 1.4,
                  }}
                >
                  {PASSWORD_ERROR_MESSAGE}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Confirm New Password *
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter new password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isChangingPassword}
              style={{ marginTop: '0.5rem' }}
            >
              {isChangingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
