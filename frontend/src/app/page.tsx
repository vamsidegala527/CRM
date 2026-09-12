'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Customer, CustomerInput, User } from '../types/customer';
import { api } from '../lib/api';
import Navbar from '../components/Navbar';
import CustomerList from '../components/CustomerList';
import CustomerModal from '../components/CustomerModal';
import CustomerDetailModal from '../components/CustomerDetailModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ChatbotWidget from '../components/ChatbotWidget';

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Customer Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  
  // Search & Filter State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  
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

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Auth Guard
  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await api.getCurrentUser();
        setCurrentUser(user);
      } catch (err) {
        router.push('/login');
      } finally {
        setAuthChecking(false);
      }
    }
    checkAuth();
  }, [router]);

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
  };

  const handleOpenEdit = (customer: Customer) => {
    setSelectedCustomerForEdit(customer);
    setIsAddEditOpen(true);
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

  if (authChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)'
      }}>
        Loading account...
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
        onLogout={() => router.push('/login')}
      />

      <div className="container" style={{ marginTop: '2rem' }}>
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
        onClose={() => setIsAddEditOpen(false)}
        onSubmit={handleSaveCustomer}
        customer={selectedCustomerForEdit}
        isSubmitting={isSubmitting}
      />

      <CustomerDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
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
