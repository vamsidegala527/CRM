'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Customer, CustomerInput, User } from '../types/customer';
import { api, getStoredUser, setStoredUser } from '../lib/api';
import Navbar from '../components/Navbar';
import CustomerList from '../components/CustomerList';
import CustomerModal from '../components/CustomerModal';
import CustomerDetailModal from '../components/CustomerDetailModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ChatbotWidget from '../components/ChatbotWidget';

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredUser());
  const [authChecking, setAuthChecking] = useState(true);
  const [authElapsed, setAuthElapsed] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);

  // Email verification state
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [showVerifyInput, setShowVerifyInput] = useState(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState('');

  // Customer Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('crm_page');
      if (saved) {
        const p = parseInt(saved, 10);
        if (!isNaN(p) && p > 0) return p;
      }
    }
    return 1;
  });
  const [limit] = useState(10);
  
  // Search & Filter State
  const [search, setSearch] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('crm_search') || '';
    }
    return '';
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('crm_status_filter') || 'All';
    }
    return 'All';
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCustomerForDetail, setSelectedCustomerForDetail] = useState<Customer | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCustomerForDelete, setSelectedCustomerForDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Save search, statusFilter, page into sessionStorage to persist across reloads
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crm_search', search);
    }
  }, [search]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crm_status_filter', statusFilter);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crm_page', page.toString());
    }
  }, [page]);

  // Restore active modal state if user refreshed while modal was open
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedModal = sessionStorage.getItem('crm_active_modal');
        if (savedModal) {
          const parsed = JSON.parse(savedModal);
          if (parsed.type === 'add') {
            setSelectedCustomerForEdit(null);
            setIsAddEditOpen(true);
          } else if (parsed.type === 'edit' && parsed.customer) {
            setSelectedCustomerForEdit(parsed.customer);
            setIsAddEditOpen(true);
          } else if (parsed.type === 'detail' && parsed.customer) {
            setSelectedCustomerForDetail(parsed.customer);
            setIsDetailOpen(true);
          }
        }
      } catch (err) {
        console.error('Failed to restore modal state', err);
      }
    }
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Cold start elapsed timer
  useEffect(() => {
    let timer: any;
    if (authChecking) {
      timer = setInterval(() => {
        setAuthElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setAuthElapsed(0);
    }
    return () => clearInterval(timer);
  }, [authChecking]);

  // Auth Guard with Cold Start & Retry Support
  const checkAuth = useCallback(async () => {
    setAuthError(null);
    setAuthChecking(true);
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
      setStoredUser(user);
      setAuthChecking(false);
    } catch (err: any) {
      if (err.status === 401 || err.message?.includes('401') || err.message?.includes('credentials')) {
        router.push('/login');
      } else {
        setAuthError(err.message || 'Connection timed out. The backend server might be performing a cold start.');
      }
      setAuthChecking(false);
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Email verification handlers
  const handleResendVerification = async () => {
    if (!currentUser?.email) return;
    try {
      setIsVerifyingEmail(true);
      const res = await api.resendVerification(currentUser.email);
      showNotification(res.message || 'Verification email sent! Please check your inbox to verify your account.');
    } catch (err: any) {
      showNotification(err.message || 'Failed to resend verification token', 'error');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTokenInput.trim()) return;
    try {
      setIsVerifyingEmail(true);
      const res = await api.verifyEmail(verifyTokenInput.trim());
      showNotification(res.message || 'Email verified successfully!');
      if (currentUser) {
        const updated = { ...currentUser, is_verified: true };
        setCurrentUser(updated);
        setStoredUser(updated);
      }
      setShowVerifyInput(false);
      setVerifyTokenInput('');
    } catch (err: any) {
      showNotification(err.message || 'Verification token is invalid or expired', 'error');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  // Fetch Customers
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getCustomers({
        search,
        status: statusFilter,
        page,
        limit,
      });
      setCustomers(res.items);
      setTotal(res.total);
    } catch (err: any) {
      showNotification(err.message || 'Error fetching customers from PostgreSQL', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, page, limit]);

  useEffect(() => {
    if (!authChecking && currentUser) {
      fetchCustomers();
    }
  }, [authChecking, currentUser, fetchCustomers]);

  // Add / Edit Handlers
  const handleOpenAdd = () => {
    setSelectedCustomerForEdit(null);
    setIsAddEditOpen(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crm_active_modal', JSON.stringify({ type: 'add' }));
    }
  };

  const handleOpenEdit = (customer: Customer) => {
    setSelectedCustomerForEdit(customer);
    setIsAddEditOpen(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crm_active_modal', JSON.stringify({ type: 'edit', customer }));
    }
  };

  const handleCloseAddEdit = () => {
    setIsAddEditOpen(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('crm_active_modal');
    }
  };

  const handleSaveCustomer = async (data: CustomerInput) => {
    setIsSubmitting(true);
    try {
      if (selectedCustomerForEdit) {
        await api.updateCustomer(selectedCustomerForEdit.id, data);
        showNotification(`Customer "${data.name}" updated successfully.`);
      } else {
        await api.createCustomer(data);
        showNotification(`New customer "${data.name}" created successfully.`);
      }
      handleCloseAddEdit();
      fetchCustomers();
    } catch (err: any) {
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenView = (customer: Customer) => {
    setSelectedCustomerForDetail(customer);
    setIsDetailOpen(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crm_active_modal', JSON.stringify({ type: 'detail', customer }));
    }
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('crm_active_modal');
    }
  };

  const handleOpenDelete = (customer: Customer) => {
    setSelectedCustomerForDelete(customer);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedCustomerForDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteCustomer(selectedCustomerForDelete.id);
      showNotification(`Customer "${selectedCustomerForDelete.name}" deleted successfully.`);
      setIsDeleteOpen(false);
      fetchCustomers();
    } catch (err: any) {
      showNotification(err.message || 'Failed to delete customer', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (authChecking && !currentUser) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(99, 102, 241, 0.15), transparent 70%)'
      }}>
        <div className="glass-panel" style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.5rem 2rem',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: '3px solid rgba(99, 102, 241, 0.2)',
            borderTopColor: '#6366F1',
            margin: '0 auto 1.5rem',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          
          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Connecting to Server...
          </h3>
          
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1.25rem' }}>
            Cloud backends may take 15–30 seconds on cold starts. We are securing your session and waking up the services.
          </p>

          <div style={{
            display: 'inline-block',
            padding: '0.35rem 0.85rem',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(99, 102, 241, 0.12)',
            color: '#818CF8',
            fontSize: '0.8rem',
            fontWeight: '600',
            marginBottom: '1.5rem'
          }}>
            ⏱️ Elapsed: {authElapsed}s
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => checkAuth()}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.55rem 1.15rem' }}
            >
              🔄 Retry Connection
            </button>
            <button
              onClick={() => router.push('/login')}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '0.55rem 1.15rem' }}
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authError && !currentUser) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}>
        <div className="glass-panel" style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.5rem 2rem',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid rgba(244, 63, 94, 0.3)'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#F87171', marginBottom: '0.5rem' }}>
            Backend Wake-Up / Connection Issue
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1.5rem' }}>
            {authError}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => checkAuth()}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.6rem 1.25rem' }}
            >
              🔄 Retry Now
            </button>
            <button
              onClick={() => router.push('/login')}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '0.6rem 1.25rem' }}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = customers.filter(c => c.status === 'Active').length;
  const leadCount = customers.filter(c => c.status === 'Lead').length;
  const prospectCount = customers.filter(c => c.status === 'Prospect').length;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '3rem' }}>
      <Navbar
        user={currentUser}
        onLogout={() => api.logout()}
      />

      <div className="container" style={{ marginTop: '2rem' }}>
        {/* Unverified Email Warning Banner */}
        {currentUser && currentUser.is_verified === false && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(234, 179, 8, 0.15) 0%, rgba(245, 158, 11, 0.08) 100%)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '1.1rem' }}>✉️</span>
              <span style={{ fontSize: '0.875rem', color: '#FDE047' }}>
                <strong>Email verification needed:</strong> Your account (<em>{currentUser.email}</em>) has not yet been verified.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {showVerifyInput ? (
                <form onSubmit={handleVerifyEmail} style={{ display: 'flex', gap: '0.35rem' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={verifyTokenInput}
                    onChange={(e) => setVerifyTokenInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{
                      padding: '0.3rem 0.65rem',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      letterSpacing: '3px',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(234, 179, 8, 0.4)',
                      borderRadius: '4px',
                      color: '#FFF',
                      width: '130px'
                    }}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isVerifyingEmail || verifyTokenInput.trim().length !== 6}
                    className="btn btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVerifyInput(false)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <button
                    onClick={() => setShowVerifyInput(true)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', borderColor: 'rgba(234, 179, 8, 0.4)', color: '#FDE047' }}
                  >
                    Enter Code
                  </button>
                  <button
                    onClick={handleResendVerification}
                    disabled={isVerifyingEmail}
                    className="btn btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', background: 'rgba(234, 179, 8, 0.25)', border: '1px solid rgba(234, 179, 8, 0.5)', color: '#FEF08A' }}
                  >
                    {isVerifyingEmail ? 'Sending...' : 'Resend Code'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {/* Notification Alert */}
        {notification && (
          <div style={{
            background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            border: `1px solid ${notification.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            color: notification.type === 'success' ? '#34D399' : '#F87171',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              &times;
            </button>
          </div>
        )}

        {/* Dashboard Metrics Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem'
        }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Customers
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' }}>
              {total}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Accounts
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' }}>
              {activeCount}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#22D3EE', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sales Leads
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' }}>
              {leadCount}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Prospects
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' }}>
              {prospectCount}
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by customer name, email, company, or phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{ paddingLeft: '2.5rem' }}
              />
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }}>
                &#128065;
              </span>
            </div>

            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Lead">Leads Only</option>
              <option value="Prospect">Prospects Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>

          <button onClick={handleOpenAdd} className="btn btn-primary">
            + Add New Customer
          </button>
        </div>

        {/* Customer Data Table */}
        <CustomerList
          customers={customers}
          total={total}
          page={page}
          limit={limit}
          onPageChange={(p) => setPage(p)}
          onView={handleOpenView}
          onEdit={handleOpenEdit}
          onDelete={handleOpenDelete}
          isLoading={isLoading}
        />
      </div>

      {/* Modals */}
      <CustomerModal
        isOpen={isAddEditOpen}
        onClose={handleCloseAddEdit}
        onSubmit={handleSaveCustomer}
        customer={selectedCustomerForEdit}
        isSubmitting={isSubmitting}
      />

      <CustomerDetailModal
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        customer={selectedCustomerForDetail}
        onEdit={(cust) => handleOpenEdit(cust)}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        customer={selectedCustomerForDelete}
        isDeleting={isDeleting}
      />

      {/* Floating AI Assistant Chatbot */}
      <ChatbotWidget onCustomerChange={fetchCustomers} />
    </div>
  );
}
