'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  EmployeeMetrics,
  AccountStatusFilter,
  SetupStatusFilter,
} from '../types/employee';
import { api, getStoredUser, setStoredUser, removeAuthToken } from '../lib/api';
import Navbar from '../components/Navbar';
import EmployeeList from '../components/EmployeeList';
import EmployeeModal from '../components/EmployeeModal';
import EmployeeDetailModal from '../components/EmployeeDetailModal';
import EmployeeDeleteModal from '../components/EmployeeDeleteModal';
import DeactivateModal from '../components/DeactivateModal';
import EmployeeSelfService from '../components/EmployeeSelfService';
import CompanyDetailsModal from '../components/CompanyDetailsModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ChatbotWidget from '../components/ChatbotWidget';

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authElapsed, setAuthElapsed] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Employee Directory Data & Filter State (Admin)
  const [employees, setEmployees] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>('All');
  const [setupStatusFilter, setSetupStatusFilter] = useState<SetupStatusFilter>('All');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [isEmployeeLoading, setIsEmployeeLoading] = useState(false);

  // Global KPI Metrics (Direct DB count, immune to filters/search/pagination)
  const [employeeMetrics, setEmployeeMetrics] = useState<EmployeeMetrics>({
    total_employees: 0,
    active_staff: 0,
    inactive_staff: 0,
    setup_pending: 0,
    setup_completed: 0,
  });

  // Modal States
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [selectedEmployeeForEdit, setSelectedEmployeeForEdit] = useState<User | null>(null);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);

  const [isEmployeeDetailOpen, setIsEmployeeDetailOpen] = useState(false);
  const [selectedEmployeeForDetail, setSelectedEmployeeForDetail] = useState<User | null>(null);

  const [isEmployeeDeleteOpen, setIsEmployeeDeleteOpen] = useState(false);
  const [selectedEmployeeForDelete, setSelectedEmployeeForDelete] = useState<User | null>(null);

  // Deactivate Modal State
  const [employeeToDeactivate, setEmployeeToDeactivate] = useState<User | null>(null);
  const [isDeactivatingEmployee, setIsDeactivatingEmployee] = useState(false);

  // Company Details Modal State
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  // Change Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Hydration safety & restore state from sessionStorage
  useEffect(() => {
    setMounted(true);
    const stored = getStoredUser();
    if (stored) {
      setCurrentUser(stored);
    }
    if (typeof window !== 'undefined') {
      const savedSearch = sessionStorage.getItem('hr_search');
      if (savedSearch) setSearch(savedSearch);
      const savedAccountFilter = sessionStorage.getItem('hr_account_filter');
      if (savedAccountFilter) setAccountStatusFilter(savedAccountFilter as AccountStatusFilter);
      const savedSetupFilter = sessionStorage.getItem('hr_setup_filter');
      if (savedSetupFilter) setSetupStatusFilter(savedSetupFilter as SetupStatusFilter);
      const savedPage = sessionStorage.getItem('hr_page');
      if (savedPage) {
        const p = parseInt(savedPage, 10);
        if (!isNaN(p) && p > 0) setPage(p);
      }
    }
  }, []);

  // Save search & filter states to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && mounted) {
      sessionStorage.setItem('hr_search', search);
      sessionStorage.setItem('hr_account_filter', accountStatusFilter);
      sessionStorage.setItem('hr_setup_filter', setupStatusFilter);
      sessionStorage.setItem('hr_page', page.toString());
    }
  }, [search, accountStatusFilter, setupStatusFilter, page, mounted]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Cold Start Elapsed Timer for User Feedback
  useEffect(() => {
    let timer: NodeJS.Timeout;
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
        setAuthError(err.message || 'Server is waking up. Please try again in a few moments.');
      }
      setAuthChecking(false);
    }
  }, [router]);

  useEffect(() => {
    if (!mounted) return;
    const stored = getStoredUser();
    if (!stored) {
      router.push('/login');
      return;
    }
    checkAuth();
  }, [mounted, checkAuth, router]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    removeAuthToken();
    router.push('/login');
  };

  // Fetch Employee Metrics (independent from search, filters, and pagination)
  const fetchEmployeeMetrics = useCallback(async () => {
    try {
      const m = await api.getEmployeeMetrics();
      setEmployeeMetrics(m);
    } catch (err: any) {
      console.error('Failed to fetch employee metrics:', err);
    }
  }, []);

  // Fetch Employees (Admin only)
  const fetchEmployees = useCallback(async () => {
    setIsEmployeeLoading(true);
    try {
      const emps = await api.getEmployees({
        search: search.trim() || undefined,
        account_status: accountStatusFilter !== 'All' ? accountStatusFilter : undefined,
        setup_status: setupStatusFilter !== 'All' ? setupStatusFilter : undefined,
        skip: (page - 1) * limit,
        limit,
      });
      setEmployees(emps);
    } catch (err: any) {
      showNotification(err.message || 'Unable to load employees. Please try again.', 'error');
    } finally {
      setIsEmployeeLoading(false);
    }
  }, [search, accountStatusFilter, setupStatusFilter, page, limit]);

  // Computed pagination totals
  const totalEmployeesCount = useMemo(() => {
    if (search.trim()) {
      return employees.length < limit && page === 1
        ? employees.length
        : Math.max(employees.length, employeeMetrics.total_employees);
    }
    if (accountStatusFilter === 'Active' && setupStatusFilter === 'Pending') {
      return Math.min(employeeMetrics.active_staff, employeeMetrics.setup_pending);
    }
    if (accountStatusFilter === 'Active' && setupStatusFilter === 'Completed') {
      return Math.min(employeeMetrics.active_staff, employeeMetrics.setup_completed);
    }
    if (accountStatusFilter === 'Active') return employeeMetrics.active_staff;
    if (accountStatusFilter === 'Inactive') return employeeMetrics.inactive_staff;
    if (setupStatusFilter === 'Pending') return employeeMetrics.setup_pending;
    if (setupStatusFilter === 'Completed') return employeeMetrics.setup_completed;
    return employeeMetrics.total_employees;
  }, [accountStatusFilter, setupStatusFilter, employeeMetrics, search, employees.length, limit, page]);

  const totalPages = Math.max(1, Math.ceil((totalEmployeesCount || 1) / limit));

  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  // Trigger data load for Admin
  useEffect(() => {
    if (!authChecking && currentUser && currentUser.role === 'admin') {
      fetchEmployees();
      fetchEmployeeMetrics();
    }
  }, [authChecking, currentUser, fetchEmployees, fetchEmployeeMetrics]);

  // Reset to page 1 on filter or search change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleAccountStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAccountStatusFilter(e.target.value as AccountStatusFilter);
    setPage(1);
  };

  const handleSetupStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetupStatusFilter(e.target.value as SetupStatusFilter);
    setPage(1);
  };

  // Employee Modal Handlers
  const handleOpenAddEmployee = () => {
    setSelectedEmployeeForEdit(null);
    setIsEmployeeModalOpen(true);
  };

  const handleOpenEditEmployee = (emp: User) => {
    setSelectedEmployeeForEdit(emp);
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = async (data: EmployeeCreateInput | EmployeeUpdateInput) => {
    setIsSavingEmployee(true);
    try {
      if (selectedEmployeeForEdit) {
        await api.updateEmployee(selectedEmployeeForEdit.id, data as EmployeeUpdateInput);
        showNotification(`Employee "${data.full_name}" updated successfully.`);
      } else {
        const newEmp = await api.createEmployee(data as EmployeeCreateInput);
        if (newEmp.setup_url && typeof navigator !== 'undefined' && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(newEmp.setup_url);
          } catch (_) { }
        }
        showNotification(
          newEmp.setup_url
            ? `Employee "${data.full_name}" created & setup link copied to clipboard!`
            : `Employee "${data.full_name}" created and onboarding invitation dispatched!`
        );
      }
      setIsEmployeeModalOpen(false);
      fetchEmployees();
      fetchEmployeeMetrics();
    } catch (err: any) {
      throw err;
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const [copyingSetupId, setCopyingSetupId] = useState<number | null>(null);

  const handleCopySetupLink = async (emp: User) => {
    setCopyingSetupId(emp.id);
    try {
      const res = await api.getEmployeeSetupLink(emp.id);
      if (res.setup_url) {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(res.setup_url);
        }
        showNotification(`✓ Setup link for ${emp.full_name} copied to clipboard!`);
      } else {
        showNotification(res.message || 'Setup link is not available.', 'info');
      }
    } catch (err: any) {
      showNotification(err.message || 'Failed to generate setup link.', 'error');
    } finally {
      setCopyingSetupId(null);
    }
  };

  const handleSendLoginEmail = async (emp: User) => {
    setSendingEmailId(emp.id);
    try {
      const res = await api.sendEmployeeLoginEmail(emp.id);
      if (res.setup_url && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(res.setup_url);
        } catch (_) { }
      }
      if (res.email_delivered === false) {
        showNotification(res.message || `Setup link copied to clipboard!`, 'info');
      } else {
        showNotification(res.message || `Setup link copied to clipboard and email sent!`);
      }
      fetchEmployees();
      fetchEmployeeMetrics();
    } catch (err: any) {
      showNotification(err.message || 'Unable to send setup email.', 'error');
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleDeactivateEmployee = (emp: User) => {
    setEmployeeToDeactivate(emp);
  };

  const handleConfirmDeactivateEmployee = async (emp: User) => {
    setIsDeactivatingEmployee(true);
    try {
      const res = await api.deactivateEmployee(emp.id, false, false);
      showNotification(res.message || `${emp.full_name} deactivated.`);
      setEmployeeToDeactivate(null);
      fetchEmployees();
      fetchEmployeeMetrics();
    } catch (err: any) {
      showNotification(err.message || 'Failed to deactivate employee.', 'error');
    } finally {
      setIsDeactivatingEmployee(false);
    }
  };

  const handleReactivateEmployee = async (emp: User) => {
    try {
      await api.reactivateEmployee(emp.id);
      showNotification(`Employee "${emp.full_name}" reactivated successfully. Account is now active.`);
      fetchEmployees();
      fetchEmployeeMetrics();
    } catch (err: any) {
      showNotification(err.message || 'Failed to reactivate employee.', 'error');
    }
  };

  const handleOpenDeleteEmployee = (emp: User) => {
    setSelectedEmployeeForDelete(emp);
    setIsEmployeeDeleteOpen(true);
  };

  const handleConfirmDeleteEmployee = async (emp: User, permanent: boolean, confirmed: boolean) => {
    try {
      const res = await api.deactivateEmployee(emp.id, permanent, confirmed);
      showNotification(res.message || (permanent ? 'Employee permanently deleted.' : 'Employee deactivated.'));
      fetchEmployees();
      fetchEmployeeMetrics();
    } catch (err: any) {
      throw err;
    }
  };

  const handleViewEmployee = (emp: User) => {
    setSelectedEmployeeForDetail(emp);
    setIsEmployeeDetailOpen(true);
  };

  if (!mounted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main, #0B0F19)',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366F1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authChecking && !currentUser) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-main, #0B0F19)',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366F1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Securing HR Portal session...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main, #0B0F19)' }}>
      <Navbar
        user={currentUser}
        onLogout={handleLogout}
        onOpenCompanyProfile={() => setIsCompanyModalOpen(true)}
        onChangePassword={() => setIsPasswordModalOpen(true)}
      />

      <main style={{ flex: 1, padding: '2rem 1.5rem 8rem 1.5rem', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        {/* Global Notification Banner */}
        {notification && (
          <div style={{
            background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : notification.type === 'info' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            border: `1px solid ${notification.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : notification.type === 'info' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            color: notification.type === 'success' ? '#34D399' : notification.type === 'info' ? '#A5B4FC' : '#F87171',
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

        {/* ROLE VIEW ROUTING */}
        {currentUser?.role === 'employee' ? (
          /* ROLE 1: EMPLOYEE SELF-SERVICE */
          <EmployeeSelfService
            user={currentUser}
            onUserUpdate={(u) => {
              setCurrentUser(u);
              setStoredUser(u);
            }}
            showNotification={showNotification}
          />
        ) : (
          /* ROLE 2: HR/ADMIN PORTAL DASHBOARD */
          <>
            {/* Dashboard Header Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '1.75rem',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <h1 style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: 'var(--text-main)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>👥</span> Dashboard
                </h1>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleOpenAddEmployee}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.25rem',
                    fontWeight: 600,
                    fontSize: '0.92rem',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                  }}
                >
                  <span>➕</span> Add Employee
                </button>
              </div>
            </div>

            {/* 5 KPI Metric Cards (Calculated independently from search, filters, and pagination) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1rem',
              marginBottom: '1.75rem'
            }}>
              {/* Card 1: Total Employees */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Total Employees
                  </span>
                  <span style={{ fontSize: '1.1rem' }}>👥</span>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.35rem' }}>
                  {employeeMetrics.total_employees}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>All staff records</span>
              </div>

              {/* Card 2: Active Staff */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Active Staff
                  </span>
                  <span style={{ fontSize: '1.1rem' }}>⚡</span>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#34D399', marginTop: '0.35rem' }}>
                  {employeeMetrics.active_staff}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Authorized to sign in</span>
              </div>

              {/* Card 3: Inactive Staff */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Inactive Staff
                  </span>
                  <span style={{ fontSize: '1.1rem' }}>⏸️</span>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#F87171', marginTop: '0.35rem' }}>
                  {employeeMetrics.inactive_staff}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Deactivated / Suspended</span>
              </div>

              {/* Card 4: Setup Pending */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Setup Pending
                  </span>
                  <span style={{ fontSize: '1.1rem' }}>⏳</span>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#FBBF24', marginTop: '0.35rem' }}>
                  {employeeMetrics.setup_pending}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Awaiting password setup</span>
              </div>

              {/* Card 5: Setup Completed */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: '#818CF8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Setup Completed
                  </span>
                  <span style={{ fontSize: '1.1rem' }}>✓</span>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#818CF8', marginTop: '0.35rem' }}>
                  {employeeMetrics.setup_completed}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Active profile onboarded</span>
              </div>
            </div>

            {/* Filter & Search Toolbar (Two Independent Filters) */}
            <div className="glass-panel" style={{
              padding: '1.1rem 1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              {/* Search Box */}
              <div style={{ flex: '1 1 300px', position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-subtle)',
                  fontSize: '0.9rem'
                }}>
                  🔍
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by name, email, department, role, phone, company, or ID..."
                  value={search}
                  onChange={handleSearchChange}
                  style={{ paddingLeft: '2.4rem' }}
                />
              </div>

              {/* Two Independent Filter Dropdowns */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Filter 1: Account Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label htmlFor="account-status-filter" style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Account:
                  </label>
                  <select
                    id="account-status-filter"
                    className="form-control"
                    value={accountStatusFilter}
                    onChange={handleAccountStatusChange}
                    style={{ minWidth: '130px' }}
                  >
                    <option value="All">All Accounts</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                {/* Filter 2: Setup Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label htmlFor="setup-status-filter" style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Setup:
                  </label>
                  <select
                    id="setup-status-filter"
                    className="form-control"
                    value={setupStatusFilter}
                    onChange={handleSetupStatusChange}
                    style={{ minWidth: '140px' }}
                  >
                    <option value="All">All Setup</option>
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                {/* Clear Filters Button */}
                {(search || accountStatusFilter !== 'All' || setupStatusFilter !== 'All') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setAccountStatusFilter('All');
                      setSetupStatusFilter('All');
                      setPage(1);
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.85rem' }}
                    title="Reset all filters and search"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Employee Directory Table */}
            <EmployeeList
              employees={employees}
              isLoading={isEmployeeLoading}
              onView={handleViewEmployee}
              onEdit={handleOpenEditEmployee}
              onDeactivate={handleDeactivateEmployee}
              onReactivate={handleReactivateEmployee}
              onDelete={handleOpenDeleteEmployee}
              onSendEmail={handleSendLoginEmail}
              sendingEmailId={sendingEmailId}
              onCopySetupLink={handleCopySetupLink}
              copyingSetupId={copyingSetupId}
            />

            {/* Pagination Controls - Completely hidden if employees <= 15, only rendered when employees > 15 */}
            {totalEmployeesCount > 15 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1.75rem',
                padding: '1.15rem 1.5rem',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius-lg, 12px)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                flexWrap: 'wrap',
                gap: '1.25rem',
                fontSize: '0.875rem',
                color: 'var(--text-subtle)'
              }}>
                {/* Left: Record Count and Page Size Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <div>
                    <span>
                      Showing <strong style={{ color: '#F1F5F9' }}>{(page - 1) * limit + 1}</strong> to{' '}
                      <strong style={{ color: '#F1F5F9' }}>{Math.min((page - 1) * limit + employees.length, totalEmployeesCount)}</strong> of{' '}
                      <strong style={{ color: '#F1F5F9' }}>{totalEmployeesCount}</strong> employees
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <label htmlFor="limit-select" style={{ color: 'var(--text-muted)' }}>Per page:</label>
                    <select
                      id="limit-select"
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                      }}
                      style={{
                        background: 'rgba(30, 41, 59, 0.85)',
                        color: '#F1F5F9',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                {/* Right: Page Navigation Options */}
                <div style={{
                  display: 'flex',
                  gap: '0.4rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  paddingRight: '120px' // Guarantees the controls never sit under the floating AI button
                }}>
                  {/* First Page */}
                  <button
                    type="button"
                    disabled={page <= 1 || isEmployeeLoading}
                    onClick={() => setPage(1)}
                    title="Go to First Page"
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.65rem',
                      opacity: page <= 1 ? 0.35 : 1,
                      cursor: page <= 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    « First
                  </button>

                  {/* Previous Page */}
                  <button
                    type="button"
                    disabled={page <= 1 || isEmployeeLoading}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    title="Previous Page"
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.75rem',
                      opacity: page <= 1 ? 0.35 : 1,
                      cursor: page <= 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ‹ Prev
                  </button>

                  {/* Page Number Buttons */}
                  {pageNumbers.map((p, idx) => {
                    if (p === '...') {
                      return (
                        <span key={`ellipsis-${idx}`} style={{ padding: '0 0.35rem', color: 'var(--text-muted)' }}>
                          ...
                        </span>
                      );
                    }
                    const isCurrent = p === page;
                    return (
                      <button
                        key={`page-${p}`}
                        type="button"
                        disabled={isEmployeeLoading}
                        onClick={() => setPage(Number(p))}
                        style={{
                          minWidth: '34px',
                          height: '32px',
                          borderRadius: '8px',
                          border: isCurrent ? '1px solid #818CF8' : '1px solid rgba(255, 255, 255, 0.1)',
                          background: isCurrent ? 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)' : 'rgba(30, 41, 59, 0.6)',
                          color: isCurrent ? '#FFFFFF' : 'var(--text-main, #F1F5F9)',
                          fontWeight: isCurrent ? 700 : 500,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          boxShadow: isCurrent ? '0 0 12px rgba(99, 102, 241, 0.5)' : 'none',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}

                  {/* Next Page */}
                  <button
                    type="button"
                    disabled={page >= totalPages || employees.length < limit || isEmployeeLoading}
                    onClick={() => setPage((prev) => prev + 1)}
                    title="Next Page"
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.75rem',
                      opacity: (page >= totalPages || employees.length < limit) ? 0.35 : 1,
                      cursor: (page >= totalPages || employees.length < limit) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next ›
                  </button>

                  {/* Last Page */}
                  <button
                    type="button"
                    disabled={page >= totalPages || employees.length < limit || isEmployeeLoading}
                    onClick={() => setPage(totalPages)}
                    title="Go to Last Page"
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.65rem',
                      opacity: (page >= totalPages || employees.length < limit) ? 0.35 : 1,
                      cursor: (page >= totalPages || employees.length < limit) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Last »
                  </button>
                </div>
              </div>
            )}

            {/* Modals */}
            <EmployeeModal
              isOpen={isEmployeeModalOpen}
              onClose={() => setIsEmployeeModalOpen(false)}
              onSubmit={handleSaveEmployee}
              employee={selectedEmployeeForEdit}
              isSubmitting={isSavingEmployee}
            />

            <EmployeeDetailModal
              isOpen={isEmployeeDetailOpen}
              onClose={() => setIsEmployeeDetailOpen(false)}
              employee={selectedEmployeeForDetail}
              onEdit={(emp) => {
                setIsEmployeeDetailOpen(false);
                handleOpenEditEmployee(emp);
              }}
              onSendEmail={handleSendLoginEmail}
              isSendingEmail={sendingEmailId === selectedEmployeeForDetail?.id}
              onCopySetupLink={handleCopySetupLink}
              isCopyingSetup={copyingSetupId === selectedEmployeeForDetail?.id}
            />

            <EmployeeDeleteModal
              isOpen={isEmployeeDeleteOpen}
              onClose={() => setIsEmployeeDeleteOpen(false)}
              employee={selectedEmployeeForDelete}
              onConfirm={handleConfirmDeleteEmployee}
            />

            <DeactivateModal
              isOpen={!!employeeToDeactivate}
              onClose={() => {
                if (!isDeactivatingEmployee) {
                  setEmployeeToDeactivate(null);
                }
              }}
              employee={employeeToDeactivate}
              onConfirm={handleConfirmDeactivateEmployee}
              isProcessing={isDeactivatingEmployee}
            />
          </>
        )}
      </main>

      {/* Company Details Modal */}
      <CompanyDetailsModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        isAdmin={currentUser?.role === 'admin'}
        showNotification={showNotification}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        showNotification={showNotification}
      />

      {/* Nexus AI Chatbot Assistant */}
      <ChatbotWidget
        user={currentUser}
        onEmployeeChange={() => {
          if (currentUser?.role === 'admin') {
            fetchEmployees();
            fetchEmployeeMetrics();
          }
        }}
        onProfileUpdate={(updatedUser) => {
          setCurrentUser(updatedUser);
          setStoredUser(updatedUser);
        }}
      />
    </div>
  );
}
