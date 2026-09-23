'use client';

import React, { useState, useEffect } from 'react';
import { User, EmployeeSelfUpdateInput } from '../types/employee';
import { api, setStoredUser } from '../lib/api';
import { formatUserFriendlyError } from '../lib/errorUtils';
import PhoneInput from './PhoneInput';
import { formatPhoneNumberDisplay } from '../lib/phoneUtils';

interface EmployeeSelfServiceProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface FormState {
  full_name: string;
  department: string;
  phone: string;
  address: string;
  emergency_contact: string;
  experience_years: string;
  previous_companies: string;
  previous_roles: string;
  skills: string;
  education: string;
  certifications: string;
}

function toFormState(user: User): FormState {
  return {
    full_name: user.full_name || '',
    department: user.department || '',
    phone: user.phone || '',
    address: user.address || '',
    emergency_contact: user.emergency_contact || '',
    experience_years: user.experience_years || '',
    previous_companies: user.previous_companies || '',
    previous_roles: user.previous_roles || '',
    skills: user.skills || '',
    education: user.education || '',
    certifications: user.certifications || '',
  };
}

const TABS = [
  { key: 'personal', label: '👤 Personal & Contact Info' },
  { key: 'experience', label: '💼 Experience & History' },
  { key: 'education', label: '🎓 Education & Certifications' },
  { key: 'job', label: '🏢 Current Job & Role' },
];

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      margin: '1.25rem 0 0.85rem',
    }}>
      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#34D399', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'rgba(52, 211, 153, 0.2)' }} />
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  subvalue,
  isCopyable = false,
  badge = false,
  badgeColor = '#34D399',
}: {
  icon: string;
  label: string;
  value: string | null | undefined;
  subvalue?: string;
  isCopyable?: boolean;
  badge?: boolean;
  badgeColor?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!value && !badge) return null;

  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      display: 'flex',
      gap: '0.85rem',
      alignItems: 'flex-start',
      padding: '0.75rem 0',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    }}>
      <span style={{ fontSize: '1.15rem', minWidth: '24px', marginTop: '2px' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--text-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '3px',
        }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {badge ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: 'rgba(16, 185, 129, 0.15)',
              color: badgeColor,
              border: `1px solid ${badgeColor}40`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: badgeColor }} />
              {value || 'Active'}
            </span>
          ) : (
            <div style={{
              fontSize: '0.92rem',
              fontWeight: 500,
              color: 'var(--text-main)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {value || '—'}
            </div>
          )}

          {isCopyable && value && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy to clipboard"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                color: copied ? '#34D399' : 'var(--text-subtle)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          )}
        </div>
        {subvalue && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
            {subvalue}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyStateHint({ icon, title, description, onEdit }: { icon: string; title: string; description: string; onEdit: () => void }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '2.5rem 1.5rem',
      background: 'rgba(255, 255, 255, 0.02)',
      borderRadius: '12px',
      border: '1px dashed rgba(255, 255, 255, 0.12)',
      margin: '0.75rem 0',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
        {title}
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', maxWidth: '420px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
        {description}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="btn btn-secondary"
        style={{
          fontSize: '0.82rem',
          padding: '0.45rem 1rem',
          color: '#34D399',
          borderColor: 'rgba(52, 211, 153, 0.3)',
        }}
      >
        ✏️ Add Information
      </button>
    </div>
  );
}

export default function EmployeeSelfService({
  user,
  onUserUpdate,
  showNotification,
}: EmployeeSelfServiceProps) {
  const [activeTab, setActiveTab] = useState('personal');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(toFormState(user));
  const [isPhoneValid, setIsPhoneValid] = useState(true);

  // Sync form state if user prop changes
  useEffect(() => {
    setForm(toFormState(user));
  }, [user]);

  const avatarInitial = user.full_name?.trim()
    ? user.full_name.trim().charAt(0).toUpperCase()
    : (user.email?.charAt(0).toUpperCase() || 'E');

  const handleFieldChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancelEdit = () => {
    setForm(toFormState(user));
    setIsEditMode(false);
    setIsPhoneValid(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!form.full_name.trim()) {
      showNotification('Full name cannot be empty.', 'error');
      return;
    }

    if (form.phone.trim() && !isPhoneValid) {
      showNotification('Please provide a valid phone number or clear the field.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: EmployeeSelfUpdateInput = {
        full_name: form.full_name.trim(),
        department: form.department.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        emergency_contact: form.emergency_contact.trim() || undefined,
        experience_years: form.experience_years.trim() || undefined,
        previous_companies: form.previous_companies.trim() || undefined,
        previous_roles: form.previous_roles.trim() || undefined,
        skills: form.skills.trim() || undefined,
        education: form.education.trim() || undefined,
        certifications: form.certifications.trim() || undefined,
      };

      const updated = await api.updateEmployee(user.id, payload);
      onUserUpdate(updated);
      setStoredUser(updated);
      setForm(toFormState(updated));
      setIsEditMode(false);
      showNotification('Profile updated successfully!', 'success');
    } catch (err: any) {
      showNotification(
        formatUserFriendlyError(err, 'Unable to update profile. Please try again.'),
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to split tags
  const renderTagPills = (text: string | null | undefined, emptyTitle: string, emptyDesc: string, icon: string) => {
    if (!text || !text.trim()) {
      return (
        <EmptyStateHint
          icon={icon}
          title={emptyTitle}
          description={emptyDesc}
          onEdit={() => setIsEditMode(true)}
        />
      );
    }

    const items = text
      .split(/[,\n•;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (items.length === 0) {
      return (
        <EmptyStateHint
          icon={icon}
          title={emptyTitle}
          description={emptyDesc}
          onEdit={() => setIsEditMode(true)}
        />
      );
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
        {items.map((item, idx) => (
          <span
            key={idx}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#34D399',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span>•</span> {item}
          </span>
        ))}
      </div>
    );
  };

  // Section navigation handlers for Edit Mode
  const currentTabIndex = TABS.findIndex((t) => t.key === activeTab);
  const handlePrevTab = () => {
    if (currentTabIndex > 0) {
      setActiveTab(TABS[currentTabIndex - 1].key);
    }
  };
  const handleNextTab = () => {
    if (currentTabIndex < TABS.length - 1) {
      setActiveTab(TABS[currentTabIndex + 1].key);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {/* Main Glass Panel Container */}
      <div
        className="glass-panel"
        style={{
          background: 'rgba(11, 15, 25, 0.95)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(16, 185, 129, 0.1)',
          overflow: 'hidden',
          animation: 'fadeInUp 0.25s ease',
        }}
      >
        {/* ---- Header Section (Modeled after Company Details Modal) ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.5rem 2rem',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(6, 182, 212, 0.08) 100%)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* Avatar Pill */}
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.6rem',
                color: '#FFF',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                flexShrink: 0,
              }}
            >
              {avatarInitial}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                  {user.full_name || 'Employee Profile'}
                </h2>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '999px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.18)',
                    color: '#34D399',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399' }} />
                  Active Employee
                </span>
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                {user.job_title ? `${user.job_title} • ${user.department || 'General'}` : (user.department ? `${user.department} Department` : 'Employee Self-Service Profile')}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {!isEditMode ? (
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '10px',
                  padding: '0.55rem 1.15rem',
                  color: '#34D399',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.15)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                }}
              >
                <span>✏️</span> Edit Profile
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.82rem',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 1.15rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSaving ? 'Saving...' : '💾 Save All Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---- Horizontal Section Tab Navigation ---- */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            padding: '0.85rem 1.75rem 0',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            overflowX: 'auto',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: isActive ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                  border: isActive ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid transparent',
                  borderBottom: 'none',
                  borderRadius: '8px 8px 0 0',
                  padding: '0.65rem 1.15rem',
                  color: isActive ? '#34D399' : 'var(--text-subtle)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  bottom: '-1px',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ---- Content Body ---- */}
        <div style={{ padding: '1.75rem 2rem' }}>
          {!isEditMode ? (
            /* ============================================================== */
            /* ======================= VIEW MODE ============================ */
            /* ============================================================== */
            <div>
              {/* TAB 1: PERSONAL & CONTACT INFO */}
              {activeTab === 'personal' && (
                <div>
                  <SectionDivider label="Basic Information" />
                  <InfoRow icon="👤" label="Full Legal Name" value={user.full_name} />
                  <InfoRow
                    icon="📧"
                    label="Official Email Address"
                    value={user.email}
                    subvalue="Primary communication & login identity (Managed by Admin)"
                  />

                  <SectionDivider label="Contact Details" />
                  <InfoRow
                    icon="📞"
                    label="Phone Number"
                    value={user.phone ? formatPhoneNumberDisplay(user.phone) : null}
                  />
                  {!user.phone && (
                    <EmptyStateHint
                      icon="📞"
                      title="No phone number on record"
                      description="Add your contact number so colleagues and HR can reach you."
                      onEdit={() => setIsEditMode(true)}
                    />
                  )}
                  <InfoRow
                    icon="🏠"
                    label="Residential / Mailing Address"
                    value={user.address}
                  />
                  <InfoRow
                    icon="🚨"
                    label="Emergency Contact"
                    value={user.emergency_contact}
                    subvalue="Emergency contact person name, relationship & phone number"
                  />
                </div>
              )}

              {/* TAB 2: EXPERIENCE & HISTORY */}
              {activeTab === 'experience' && (
                <div>
                  <SectionDivider label="Career Overview" />
                  <InfoRow
                    icon="⏳"
                    label="Total Years of Professional Experience"
                    value={user.experience_years}
                  />

                  <SectionDivider label="Previously Worked Companies" />
                  {renderTagPills(
                    user.previous_companies,
                    'No previous employers listed',
                    'Add companies or organizations you previously worked with.',
                    '🏢'
                  )}

                  <SectionDivider label="Previous Roles & Designations" />
                  {renderTagPills(
                    user.previous_roles,
                    'No previous roles documented',
                    'List past titles such as Senior Developer, Product Manager, Analyst, etc.',
                    '💼'
                  )}

                  <SectionDivider label="Core Skills & Technologies" />
                  {renderTagPills(
                    user.skills,
                    'No core skills added',
                    'Showcase your professional tech stack, domain expertise, and tools.',
                    '⚡'
                  )}
                </div>
              )}

              {/* TAB 3: EDUCATION & QUALIFICATIONS */}
              {activeTab === 'education' && (
                <div>
                  <SectionDivider label="Academic Qualifications" />
                  <InfoRow
                    icon="🎓"
                    label="Highest Qualification / Degrees"
                    value={user.education}
                    subvalue="Degree, University / College, and Graduation Year"
                  />
                  {!user.education && (
                    <EmptyStateHint
                      icon="🎓"
                      title="No academic background added"
                      description="Add your degrees, colleges, or diplomas to complete your profile."
                      onEdit={() => setIsEditMode(true)}
                    />
                  )}

                  <SectionDivider label="Professional Certifications & Licenses" />
                  {renderTagPills(
                    user.certifications,
                    'No professional certifications listed',
                    'Add industry certifications (e.g., AWS, PMP, Scrum, Google Cloud, Cisco).',
                    '📜'
                  )}
                </div>
              )}

              {/* TAB 4: CURRENT JOB & ROLE */}
              {activeTab === 'job' && (
                <div>
                  <SectionDivider label="Organization Position" />
                  <InfoRow icon="💼" label="Official Job Title" value={user.job_title || 'Staff Member'} />
                  <InfoRow icon="🏢" label="Department / Division" value={user.department || 'General'} />
                  <InfoRow icon="🏛️" label="Company / Entity" value={user.company || 'Enterprise Workspace'} />

                  <SectionDivider label="System Credentials & Status" />
                  <InfoRow
                    icon="🆔"
                    label="Employee Public ID"
                    value={user.public_id || `EMP-${user.id}`}
                    isCopyable
                    subvalue="Official system identifier for administrative records"
                  />
                  <InfoRow
                    icon="⚡"
                    label="Account Status"
                    value={user.is_active ? 'Active Employee' : 'Inactive'}
                    badge
                    badgeColor="#34D399"
                  />
                  <InfoRow
                    icon="📅"
                    label="Member Since"
                    value={user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null}
                  />
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* ======================= EDIT MODE ============================ */
            /* ============================================================== */
            <form onSubmit={handleSave}>
              {/* TAB 1: EDIT PERSONAL INFO */}
              {activeTab === 'personal' && (
                <div>
                  <SectionDivider label="Edit Personal & Contact Information" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Full Name <span style={{ color: '#F87171' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={form.full_name}
                        onChange={(e) => handleFieldChange('full_name', e.target.value)}
                        placeholder="e.g. Jane Doe"
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Work Email Address <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>(Managed by Admin — Read-Only)</span>
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
                      <PhoneInput
                        label="Phone Number"
                        value={form.phone}
                        onChange={(e164Val, valid) => {
                          handleFieldChange('phone', e164Val);
                          setIsPhoneValid(valid);
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Office / Residential Address
                      </label>
                      <textarea
                        className="form-control"
                        value={form.address}
                        onChange={(e) => handleFieldChange('address', e.target.value)}
                        placeholder="e.g. 100 Innovation Way, Suite 400, San Francisco, CA"
                        rows={2}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Emergency Contact (Name & Phone)
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={form.emergency_contact}
                        onChange={(e) => handleFieldChange('emergency_contact', e.target.value)}
                        placeholder="e.g. John Doe (Spouse) - +1 (555) 234-5678"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EDIT EXPERIENCE & HISTORY */}
              {activeTab === 'experience' && (
                <div>
                  <SectionDivider label="Edit Experience & Career History" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Total Years of Professional Experience
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={form.experience_years}
                        onChange={(e) => handleFieldChange('experience_years', e.target.value)}
                        placeholder="e.g. 5+ Years, 8 Years"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Previously Worked Companies
                      </label>
                      <textarea
                        className="form-control"
                        value={form.previous_companies}
                        onChange={(e) => handleFieldChange('previous_companies', e.target.value)}
                        placeholder="e.g. Google, Microsoft, Stripe (comma or line separated)"
                        rows={3}
                      />
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '3px', display: 'block' }}>
                        Separate company names with commas or line breaks to render as tags.
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Previous Roles & Designations
                      </label>
                      <textarea
                        className="form-control"
                        value={form.previous_roles}
                        onChange={(e) => handleFieldChange('previous_roles', e.target.value)}
                        placeholder="e.g. Senior Software Engineer, Technical Lead, QA Specialist"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Core Skills & Technologies
                      </label>
                      <textarea
                        className="form-control"
                        value={form.skills}
                        onChange={(e) => handleFieldChange('skills', e.target.value)}
                        placeholder="e.g. React, TypeScript, Python, FastAPI, Docker, PostgreSQL, AWS"
                        rows={3}
                      />
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '3px', display: 'block' }}>
                        Skills are automatically converted into badges on your profile view.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: EDIT EDUCATION & CERTIFICATIONS */}
              {activeTab === 'education' && (
                <div>
                  <SectionDivider label="Edit Academic Qualifications & Certifications" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Highest Academic Qualification / Degrees
                      </label>
                      <textarea
                        className="form-control"
                        value={form.education}
                        onChange={(e) => handleFieldChange('education', e.target.value)}
                        placeholder="e.g. B.S. in Computer Science (Stanford University, 2020)&#10;M.S. in Data Engineering (MIT, 2022)"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Professional Certifications & Licenses
                      </label>
                      <textarea
                        className="form-control"
                        value={form.certifications}
                        onChange={(e) => handleFieldChange('certifications', e.target.value)}
                        placeholder="e.g. AWS Certified Solutions Architect, PMP, Certified Scrum Master"
                        rows={3}
                      />
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '3px', display: 'block' }}>
                        Separate multiple certifications with commas or line breaks.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: EDIT CURRENT JOB & ROLE */}
              {activeTab === 'job' && (
                <div>
                  <SectionDivider label="Current Job & Role (System Managed)" />
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(99, 102, 241, 0.08)',
                    borderRadius: '10px',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    marginBottom: '1.25rem',
                    fontSize: '0.85rem',
                    color: '#A5B4FC',
                    lineHeight: 1.5,
                  }}>
                    ℹ️ Official job title, organization assignment, and role permissions are managed by HR Administrators. You may adjust your assigned department if needed.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Assigned Department
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={form.department}
                        onChange={(e) => handleFieldChange('department', e.target.value)}
                        placeholder="e.g. Engineering, Sales, Marketing"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Job Title <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>(Admin Managed)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={user.job_title || ''}
                        disabled
                        style={{ opacity: 0.6, cursor: 'not-allowed' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                        Company / Organization <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>(Admin Managed)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={user.company || ''}
                        disabled
                        style={{ opacity: 0.6, cursor: 'not-allowed' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Form Navigation & Submission Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '2rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {currentTabIndex > 0 && (
                    <button
                      type="button"
                      onClick={handlePrevTab}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
                    >
                      ← Previous Section
                    </button>
                  )}
                  {currentTabIndex < TABS.length - 1 && (
                    <button
                      type="button"
                      onClick={handleNextTab}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
                    >
                      Next Section →
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.55rem 1.15rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      padding: '0.55rem 1.4rem',
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    {isSaving ? (
                      <>
                        <span
                          style={{
                            width: '14px',
                            height: '14px',
                            border: '2px solid rgba(255,255,255,0.3)',
                            borderTopColor: '#FFF',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                            display: 'inline-block',
                          }}
                        />
                        Saving Changes...
                      </>
                    ) : (
                      <>
                        <span>💾</span> Save All Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
