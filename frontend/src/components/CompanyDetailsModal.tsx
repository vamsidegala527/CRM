'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface CompanyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const EMPTY_FORM = {
  // Identity & Branding
  company_name: '',
  tagline: '',
  logo_url: '',
  industry: '',
  company_type: '',
  founded_year: '',
  company_size: '',
  registration_number: '',
  // Location & Contact
  headquarters_address: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  phone: '',
  fax: '',
  contact_email: '',
  support_email: '',
  // Online Presence
  website_url: '',
  careers_url: '',
  linkedin_url: '',
  twitter_url: '',
  instagram_url: '',
  facebook_url: '',
  // About & Culture
  about: '',
  mission: '',
  vision: '',
  core_values: '',
  culture_description: '',
  // Business Details
  annual_revenue: '',
  products_services: '',
  key_clients: '',
  certifications: '',
  awards: '',
};

type FormState = typeof EMPTY_FORM;

function toFormState(data: any): FormState {
  const s = { ...EMPTY_FORM };
  if (!data) return s;
  for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    const val = data[key];
    s[key] = val !== null && val !== undefined ? String(val) : '';
  }
  return s;
}

const SECTIONS = [
  {
    key: 'identity',
    label: '🏢 Identity & Branding',
    fields: [
      { key: 'company_name', label: 'Company Name', type: 'text', placeholder: 'e.g. Acme Corporation', required: true },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'e.g. Empowering people, together' },
      { key: 'industry', label: 'Industry', type: 'text', placeholder: 'e.g. Information Technology, Healthcare' },
      { key: 'company_type', label: 'Company Type', type: 'select', options: ['', 'Private', 'Public', 'Non-profit', 'Startup', 'Government', 'Partnership', 'Other'] },
      { key: 'founded_year', label: 'Founded Year', type: 'number', placeholder: 'e.g. 2015' },
      { key: 'company_size', label: 'Company Size', type: 'select', options: ['', '1–10', '11–50', '51–200', '201–500', '501–1000', '1001–5000', '5000+'] },
      { key: 'registration_number', label: 'Registration Number', type: 'text', placeholder: 'Official business registration ID' },
      { key: 'logo_url', label: 'Logo URL', type: 'url', placeholder: 'https://example.com/logo.png' },
    ],
  },
  {
    key: 'location',
    label: '📍 Location & Contact',
    fields: [
      { key: 'headquarters_address', label: 'Headquarters Address', type: 'textarea', placeholder: '123 Innovation Way, Suite 400' },
      { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. San Francisco' },
      { key: 'state', label: 'State / Province', type: 'text', placeholder: 'e.g. California' },
      { key: 'country', label: 'Country', type: 'text', placeholder: 'e.g. United States' },
      { key: 'postal_code', label: 'Postal / ZIP Code', type: 'text', placeholder: 'e.g. 94105' },
      { key: 'phone', label: 'Main Phone', type: 'tel', placeholder: '+1 (555) 000-0000' },
      { key: 'fax', label: 'Fax', type: 'tel', placeholder: '+1 (555) 000-0001' },
      { key: 'contact_email', label: 'Contact Email', type: 'email', placeholder: 'contact@company.com' },
      { key: 'support_email', label: 'Support / HR Email', type: 'email', placeholder: 'hr@company.com' },
    ],
  },
  {
    key: 'online',
    label: '🌐 Online Presence',
    fields: [
      { key: 'website_url', label: 'Website', type: 'url', placeholder: 'https://www.company.com' },
      { key: 'careers_url', label: 'Careers Page', type: 'url', placeholder: 'https://www.company.com/careers' },
      { key: 'linkedin_url', label: 'LinkedIn', type: 'url', placeholder: 'https://linkedin.com/company/...' },
      { key: 'twitter_url', label: 'Twitter / X', type: 'url', placeholder: 'https://twitter.com/...' },
      { key: 'instagram_url', label: 'Instagram', type: 'url', placeholder: 'https://instagram.com/...' },
      { key: 'facebook_url', label: 'Facebook', type: 'url', placeholder: 'https://facebook.com/...' },
    ],
  },
  {
    key: 'about',
    label: '📝 About & Culture',
    fields: [
      { key: 'about', label: 'About the Company', type: 'textarea', placeholder: 'Company overview, history, and general description...' },
      { key: 'mission', label: 'Mission Statement', type: 'textarea', placeholder: 'Our mission is to...' },
      { key: 'vision', label: 'Vision Statement', type: 'textarea', placeholder: 'We envision a world where...' },
      { key: 'core_values', label: 'Core Values', type: 'textarea', placeholder: 'e.g. Integrity, Innovation, Collaboration, Excellence' },
      { key: 'culture_description', label: 'Culture & Work Environment', type: 'textarea', placeholder: 'Describe the work culture, perks, and team environment...' },
    ],
  },
  {
    key: 'business',
    label: '📊 Business Details',
    fields: [
      { key: 'annual_revenue', label: 'Annual Revenue (Approx.)', type: 'text', placeholder: 'e.g. $5M – $10M' },
      { key: 'products_services', label: 'Products & Services', type: 'textarea', placeholder: 'Brief description of what the company offers...' },
      { key: 'key_clients', label: 'Key Clients / Partners', type: 'textarea', placeholder: 'Notable clients or strategic partners...' },
      { key: 'certifications', label: 'Certifications', type: 'textarea', placeholder: 'e.g. ISO 9001, SOC2 Type II, GDPR Compliant' },
      { key: 'awards', label: 'Awards & Recognition', type: 'textarea', placeholder: 'Notable awards, accolades, or recognitions received...' },
    ],
  },
];

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      margin: '0.25rem 0 1rem',
    }}>
      <span style={{ fontSize: '1rem', fontWeight: 700, color: '#A5B4FC', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: 'rgba(165,180,252,0.18)' }} />
    </div>
  );
}

function InfoRow({ icon, label, value, isLink = false }: { icon: string; label: string; value: string | null | undefined; isLink?: boolean }) {
  if (!value) return null;
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      alignItems: 'flex-start',
      padding: '0.55rem 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: '1rem', minWidth: '22px', marginTop: '1px' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
        {isLink ? (
          <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '0.9rem', color: '#818CF8', textDecoration: 'none', wordBreak: 'break-word' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            {value}
          </a>
        ) : (
          <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
        )}
      </div>
    </div>
  );
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  if (!href) return null;
  const url = href.startsWith('http') ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.4rem 0.9rem', borderRadius: '20px',
      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
      color: '#A5B4FC', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none',
      transition: 'all 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; }}
    >
      <span>{icon}</span> {label}
    </a>
  );
}

export default function CompanyDetailsModal({
  isOpen,
  onClose,
  isAdmin,
  showNotification,
}: CompanyDetailsModalProps) {
  const [companyData, setCompanyData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState('identity');

  useEffect(() => {
    if (isOpen) {
      fetchCompanyDetails();
      setIsEditMode(false);
      setActiveSection('identity');
    }
  }, [isOpen]);

  async function fetchCompanyDetails() {
    setIsLoading(true);
    try {
      const data = await api.getCompanyDetails();
      setCompanyData(data);
      setForm(toFormState(data));
    } catch (err: any) {
      showNotification(err.message || 'Failed to load company details.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  function handleFieldChange(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.company_name.trim()) {
      showNotification('Company name is required.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, any> = { ...form };
      if (payload.founded_year === '') payload.founded_year = null;
      else if (payload.founded_year) payload.founded_year = parseInt(payload.founded_year, 10);
      // Convert empty strings to null
      for (const key of Object.keys(payload)) {
        if (payload[key] === '') payload[key] = null;
      }
      const updated = await api.updateCompanyDetails(payload);
      setCompanyData(updated);
      setForm(toFormState(updated));
      setIsEditMode(false);
      showNotification('Company details saved successfully!', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to save company details.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setForm(toFormState(companyData));
    setIsEditMode(false);
  }

  if (!isOpen) return null;

  const hasAnyData = companyData && (
    companyData.company_name || companyData.industry || companyData.about || companyData.website_url
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: '860px',
        background: 'rgba(11, 15, 25, 0.98)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '20px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
        overflow: 'hidden',
        marginTop: '1rem',
        marginBottom: '2rem',
        animation: 'fadeInUp 0.25s ease',
      }}>

        {/* ---- Modal Header ---- */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.4rem 1.75rem',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(6,182,212,0.06) 100%)',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Company Logo / Avatar */}
            {companyData?.logo_url ? (
              <img
                src={companyData.logo_url}
                alt="Company Logo"
                style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'contain', background: '#fff', padding: 4 }}
                onError={(e) => { (e.target as any).style.display = 'none'; }}
              />
            ) : (
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '1.5rem', color: '#FFF',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                flexShrink: 0,
              }}>
                {companyData?.company_name ? companyData.company_name.charAt(0).toUpperCase() : '🏢'}
              </div>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {isEditMode ? 'Edit Company Details' : (companyData?.company_name || 'Company Profile')}
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-subtle)' }}>
                {isEditMode ? 'Update your organization\'s public profile' : (companyData?.tagline || 'View organization information')}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {isAdmin && !isEditMode && (
              <button
                onClick={() => setIsEditMode(true)}
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  borderRadius: '8px',
                  padding: '0.45rem 1rem',
                  color: '#A5B4FC',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
              >
                ✏️ Edit
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '0.45rem 0.75rem',
                color: 'var(--text-subtle)',
                fontSize: '1rem',
                cursor: 'pointer',
                lineHeight: 1,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ---- Section Tab Nav ---- */}
        <div style={{
          display: 'flex', gap: '0.25rem', padding: '0.75rem 1.5rem 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto',
          background: 'rgba(0,0,0,0.2)',
        }}>
          {SECTIONS.map(sec => (
            <button
              key={sec.key}
              onClick={() => setActiveSection(sec.key)}
              style={{
                background: activeSection === sec.key ? 'rgba(99,102,241,0.2)' : 'transparent',
                border: activeSection === sec.key ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                borderBottom: 'none',
                borderRadius: '8px 8px 0 0',
                padding: '0.5rem 1rem',
                color: activeSection === sec.key ? '#A5B4FC' : 'var(--text-subtle)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* ---- Content Body ---- */}
        <div style={{ padding: '1.5rem 1.75rem' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', color: 'var(--text-subtle)' }}>
              <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>⏳</span> Loading company details...
            </div>
          ) : isEditMode ? (
            /* ==== EDIT MODE ==== */
            <div>
              {SECTIONS.filter(s => s.key === activeSection).map(sec => (
                <div key={sec.key}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.1rem' }}>
                    {sec.fields.map(field => (
                      <div key={field.key} style={{
                        flex: field.type === 'textarea' ? '1 1 100%' : '1 1 calc(50% - 0.55rem)',
                        minWidth: field.type === 'textarea' ? '100%' : '200px',
                      }}>
                        <label style={{
                          display: 'block', fontSize: '0.78rem', fontWeight: 600,
                          color: 'var(--text-main)', marginBottom: '0.35rem',
                        }}>
                          {field.label}{(field as any).required && <span style={{ color: '#F87171', marginLeft: 3 }}>*</span>}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            className="form-control"
                            value={form[field.key as keyof FormState]}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            placeholder={(field as any).placeholder || ''}
                            rows={4}
                            style={{ resize: 'vertical', minHeight: '90px' }}
                          />
                        ) : field.type === 'select' ? (
                          <select
                            className="form-control"
                            value={form[field.key as keyof FormState]}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                          >
                            {(field as any).options.map((opt: string) => (
                              <option key={opt} value={opt}>{opt || '— Select —'}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            className="form-control"
                            value={form[field.key as keyof FormState]}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            placeholder={(field as any).placeholder || ''}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Section Navigation & Save */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {SECTIONS.findIndex(s => s.key === activeSection) > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.key === activeSection) - 1].key)}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem' }}
                    >
                      ← Previous
                    </button>
                  )}
                  {SECTIONS.findIndex(s => s.key === activeSection) < SECTIONS.length - 1 && (
                    <button
                      type="button"
                      onClick={() => setActiveSection(SECTIONS[SECTIONS.findIndex(s => s.key === activeSection) + 1].key)}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem' }}
                    >
                      Next →
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" onClick={handleCancel} className="btn btn-secondary" style={{ fontSize: '0.88rem' }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn btn-primary"
                    style={{ fontSize: '0.88rem', minWidth: '140px', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
                  >
                    {isSaving ? '⏳ Saving...' : '💾 Save All Changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ==== VIEW MODE ==== */
            <div>
              {!hasAnyData ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '3rem 1rem', gap: '1rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '3.5rem' }}>🏢</div>
                  <h3 style={{ margin: 0, color: 'var(--text-main)', fontWeight: 700 }}>No Company Details Yet</h3>
                  <p style={{ color: 'var(--text-subtle)', fontSize: '0.9rem', maxWidth: '380px' }}>
                    {isAdmin
                      ? 'Click "Edit" to fill in your company profile. This information will be visible to all employees.'
                      : 'Company details have not been set up yet. Please ask your administrator to fill in the company profile.'}
                  </p>
                  {isAdmin && (
                    <button onClick={() => setIsEditMode(true)} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                      ✏️ Add Company Details
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {activeSection === 'identity' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0' }}>
                        <InfoRow icon="🏭" label="Industry" value={companyData?.industry} />
                        <InfoRow icon="🏷️" label="Company Type" value={companyData?.company_type} />
                        <InfoRow icon="📅" label="Founded Year" value={companyData?.founded_year ? String(companyData.founded_year) : null} />
                        <InfoRow icon="👥" label="Company Size" value={companyData?.company_size} />
                        <InfoRow icon="🔖" label="Registration No." value={companyData?.registration_number} />
                      </div>
                    </div>
                  )}

                  {activeSection === 'location' && (
                    <div>
                      <InfoRow icon="📍" label="Headquarters Address" value={companyData?.headquarters_address} />
                      <InfoRow icon="🏙️" label="City" value={companyData?.city} />
                      <InfoRow icon="🗺️" label="State / Province" value={companyData?.state} />
                      <InfoRow icon="🌍" label="Country" value={companyData?.country} />
                      <InfoRow icon="📮" label="Postal / ZIP Code" value={companyData?.postal_code} />
                      <InfoRow icon="📞" label="Main Phone" value={companyData?.phone} />
                      <InfoRow icon="📠" label="Fax" value={companyData?.fax} />
                      <InfoRow icon="📧" label="Contact Email" value={companyData?.contact_email} />
                      <InfoRow icon="🆘" label="Support / HR Email" value={companyData?.support_email} />
                    </div>
                  )}

                  {activeSection === 'online' && (
                    <div>
                      <InfoRow icon="🌐" label="Website" value={companyData?.website_url} isLink />
                      <InfoRow icon="💼" label="Careers Page" value={companyData?.careers_url} isLink />
                      <div style={{ marginTop: '1.25rem' }}>
                        <SectionDivider label="Social Media" />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                          <SocialLink href={companyData?.linkedin_url} label="LinkedIn" icon="💼" />
                          <SocialLink href={companyData?.twitter_url} label="Twitter / X" icon="🐦" />
                          <SocialLink href={companyData?.instagram_url} label="Instagram" icon="📸" />
                          <SocialLink href={companyData?.facebook_url} label="Facebook" icon="👍" />
                        </div>
                        {!companyData?.linkedin_url && !companyData?.twitter_url && !companyData?.instagram_url && !companyData?.facebook_url && (
                          <p style={{ color: 'var(--text-subtle)', fontSize: '0.85rem', fontStyle: 'italic' }}>No social media links added.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {activeSection === 'about' && (
                    <div>
                      {companyData?.about && (
                        <>
                          <SectionDivider label="About the Company" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.about}</p>
                        </>
                      )}
                      {companyData?.mission && (
                        <>
                          <SectionDivider label="Mission" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.mission}</p>
                        </>
                      )}
                      {companyData?.vision && (
                        <>
                          <SectionDivider label="Vision" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.vision}</p>
                        </>
                      )}
                      {companyData?.core_values && (
                        <>
                          <SectionDivider label="Core Values" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.core_values}</p>
                        </>
                      )}
                      {companyData?.culture_description && (
                        <>
                          <SectionDivider label="Culture & Work Environment" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.culture_description}</p>
                        </>
                      )}
                      {!companyData?.about && !companyData?.mission && !companyData?.vision && !companyData?.core_values && !companyData?.culture_description && (
                        <p style={{ color: 'var(--text-subtle)', fontSize: '0.88rem', fontStyle: 'italic' }}>No about/culture information added yet.</p>
                      )}
                    </div>
                  )}

                  {activeSection === 'business' && (
                    <div>
                      <InfoRow icon="💰" label="Annual Revenue (Approx.)" value={companyData?.annual_revenue} />
                      {companyData?.products_services && (
                        <>
                          <SectionDivider label="Products & Services" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.products_services}</p>
                        </>
                      )}
                      {companyData?.key_clients && (
                        <>
                          <SectionDivider label="Key Clients & Partners" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.key_clients}</p>
                        </>
                      )}
                      {companyData?.certifications && (
                        <>
                          <SectionDivider label="Certifications" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.certifications}</p>
                        </>
                      )}
                      {companyData?.awards && (
                        <>
                          <SectionDivider label="Awards & Recognition" />
                          <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 0 }}>{companyData.awards}</p>
                        </>
                      )}
                      {!companyData?.annual_revenue && !companyData?.products_services && !companyData?.key_clients && !companyData?.certifications && !companyData?.awards && (
                        <p style={{ color: 'var(--text-subtle)', fontSize: '0.88rem', fontStyle: 'italic' }}>No business details added yet.</p>
                      )}
                    </div>
                  )}

                  {/* Last Updated */}
                  {companyData?.updated_at && (
                    <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-subtle)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
                      Last updated: {new Date(companyData.updated_at).toLocaleString()}
                      {isAdmin && (
                        <button
                          onClick={() => setIsEditMode(true)}
                          style={{ marginLeft: '0.75rem', background: 'none', border: 'none', color: '#818CF8', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                          ✏️ Edit
                        </button>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
