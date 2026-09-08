'use client';

import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types/customer';
import { api } from '../lib/api';

interface AdminUserManagementProps {
  currentUser: User | null;
  onNotification: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminUserManagement({ currentUser, onNotification }: AdminUserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      onNotification(err.message || 'Failed to fetch user directory.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: number, newRole: UserRole) => {
    setUpdatingId(userId);
    try {
      await api.updateUserRole(userId, newRole);
      onNotification(`User role updated to ${newRole.toUpperCase()}.`, 'success');
      fetchUsers();
    } catch (err: any) {
      onNotification(err.message || 'Failed to update user role.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusToggle = async (userId: number, currentStatus: boolean) => {
    setUpdatingId(userId);
    try {
      await api.updateUserStatus(userId, !currentStatus);
      onNotification(`User account ${!currentStatus ? 'activated' : 'deactivated'}.`, 'success');
      fetchUsers();
    } catch (err: any) {
      onNotification(err.message || 'Failed to update user status.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Admin User Directory...
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Admin Portal — Registered System Users
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', margin: '0.25rem 0 0' }}>
            Manage user authorization roles, administrative privileges, and account status.
          </p>
        </div>
        <span className="badge badge-active" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#A5B4FC', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          Total Users: {users.length}
        </span>
      </div>

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
              <th style={{ padding: '1rem 1.25rem' }}>User Profile</th>
              <th style={{ padding: '1rem 1.25rem' }}>Email Address</th>
              <th style={{ padding: '1rem 1.25rem' }}>Current Role</th>
              <th style={{ padding: '1rem 1.25rem' }}>Account Status</th>
              <th style={{ padding: '1rem 1.25rem' }}>Joined Date</th>
              <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Admin Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: u.role === 'admin' ? 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)' : 'rgba(16, 185, 129, 0.2)',
                      color: u.role === 'admin' ? '#FFF' : '#34D399',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '0.875rem'
                    }}>
                      {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                        {u.full_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        User ID #{u.id}
                      </div>
                    </div>
                  </div>
                </td>

                <td style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                  {u.email}
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    background: u.role === 'admin' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                    color: u.role === 'admin' ? '#818CF8' : '#34D399',
                    border: `1px solid ${u.role === 'admin' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`
                  }}>
                    {u.role === 'admin' ? '👑 Admin' : '👤 User'}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem' }}>
                  <span className={`badge ${u.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>

                <td style={{ padding: '1rem 1.25rem', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </td>

                <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                    {/* Role Dropdown */}
                    <select
                      className="form-control"
                      value={u.role}
                      disabled={updatingId === u.id || (currentUser?.id === u.id && u.role === 'admin')}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: 'auto' }}
                    >
                      <option value="user">User Role</option>
                      <option value="admin">Admin Role</option>
                    </select>

                    {/* Status Toggle Button */}
                    <button
                      onClick={() => handleStatusToggle(u.id, u.is_active)}
                      disabled={updatingId === u.id || currentUser?.id === u.id}
                      className={`btn ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
