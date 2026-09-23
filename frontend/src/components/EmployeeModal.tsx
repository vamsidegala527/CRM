'use client';

import React, { useState, useEffect } from 'react';
import { User, EmployeeCreateInput, EmployeeUpdateInput } from '../types/employee';
import { formatUserFriendlyError } from '../lib/errorUtils';
import PhoneInput from './PhoneInput';
import { validateEmail, EMAIL_ERROR_MESSAGE } from '../lib/validators/emailValidator';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeCreateInput | EmployeeUpdateInput) => Promise<void>;
  employee: User | null;
  isSubmitting: boolean;
}

export default function EmployeeModal({
  isOpen,
  onClose,
  onSubmit,
  employee,
  isSubmitting,
}: EmployeeModalProps) {
  const isEdit = Boolean(employee);
  const [activeTab, setActiveTab] = useState<'basic' | 'career' | 'education'>('basic');

  // Basic info
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(true);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Career & Experience
  const [experienceYears, setExperienceYears] = useState('');
  const [previousCompanies, setPreviousCompanies] = useState('');
  const [previousRoles, setPreviousRoles] = useState('');
  const [skills, setSkills] = useState('');

  // Education & Notes
  const [education, setEducation] = useState('');
  const [certifications, setCertifications] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleEmailBlur = () => {
    if (isEdit) return;
    setEmailTouched(true);
    if (!email.trim()) {
      setEmailError(EMAIL_ERROR_MESSAGE);
    } else {
      const res = validateEmail(email);
      setEmailError(res.isValid ? null : EMAIL_ERROR_MESSAGE);
    }
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (emailTouched && !isEdit) {
      const res = validateEmail(val);
      setEmailError(res.isValid ? null : EMAIL_ERROR_MESSAGE);
    }
  };

  useEffect(() => {
    if (employee) {
      setFullName(employee.full_name || '');
      setEmail(employee.email || '');
      setDepartment(employee.department || '');
      setJobTitle(employee.job_title || '');
      setCompany(employee.company || '');
      setAddress(employee.address || '');
      setPhone(employee.phone || '');
      setIsPhoneValid(true);
      setEmergencyContact(employee.emergency_contact || '');
      setExperienceYears(employee.experience_years || '');
      setPreviousCompanies(employee.previous_companies || '');
      setPreviousRoles(employee.previous_roles || '');
      setSkills(employee.skills || '');
      setEducation(employee.education || '');
      setCertifications(employee.certifications || '');
      setNotes(employee.notes || '');
      setIsActive(employee.is_active ?? true);
    } else {
      setFullName('');
      setEmail('');
      setDepartment('');
      setJobTitle('');
      setCompany('');
      setAddress('');
      setPhone('');
      setIsPhoneValid(true);
      setEmergencyContact('');
      setExperienceYears('');
      setPreviousCompanies('');
      setPreviousRoles('');
      setSkills('');
      setEducation('');
      setCertifications('');
      setNotes('');
      setIsActive(true);
    }
    setActiveTab('basic');
    setError(null);
    setEmailTouched(false);
    setEmailError(null);
  }, [employee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Full name is required.');
      setActiveTab('basic');
      return;
    }

    let cleanEmail = email.trim();
    if (!isEdit) {
      const emailRes = validateEmail(cleanEmail);
      if (!emailRes.isValid) {
        setEmailTouched(true);
        setEmailError(EMAIL_ERROR_MESSAGE);
        setActiveTab('basic');
        return;
      }
      cleanEmail = emailRes.sanitizedEmail;
    }

    if (phone.trim() && !isPhoneValid) {
      setError('Please provide a valid phone number.');
      setActiveTab('basic');
      return;
    }

    try {
      if (isEdit) {
        await onSubmit({
          full_name: fullName.trim(),
          department: department.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          company: company.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          emergency_contact: emergencyContact.trim() || undefined,
          experience_years: experienceYears.trim() || undefined,
          previous_companies: previousCompanies.trim() || undefined,
          previous_roles: previousRoles.trim() || undefined,
          skills: skills.trim() || undefined,
          education: education.trim() || undefined,
          certifications: certifications.trim() || undefined,
          notes: notes.trim() || undefined,
          is_active: isActive,
        });
      } else {
        await onSubmit({
          full_name: fullName.trim(),
          email: cleanEmail,
          department: department.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          company: company.trim() || undefined,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          emergency_contact: emergencyContact.trim() || undefined,
          experience_years: experienceYears.trim() || undefined,
          previous_companies: previousCompanies.trim() || undefined,
          previous_roles: previousRoles.trim() || undefined,
          skills: skills.trim() || undefined,
          education: education.trim() || undefined,
          certifications: certifications.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
    } catch (err: any) {
      setError(formatUserFriendlyError(err, 'Unable to save employee details. Please try again.'));
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '640px',
          width: '100%',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem' }}>
              {isEdit ? 'Edit Employee Details' : 'Add New Employee'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', margin: 0 }}>
              {isEdit
                ? 'Update employee profile, contact information, career history, and status.'
                : 'Enter employee details. An invitation setup email will be dispatched.'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-subtle)',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            &times;
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              color: '#FCA5A5',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '1.25rem',
          }}
        >
          {[
            { key: 'basic', label: '👤 General & Contact' },
            { key: 'career', label: '💼 Career & Experience' },
            { key: 'education', label: '🎓 Education & Notes' },
          ].map((tab) => {
            const isActiveTab = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  background: isActiveTab ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  border: isActiveTab ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                  borderBottom: 'none',
                  borderRadius: '6px 6px 0 0',
                  padding: '0.5rem 0.9rem',
                  color: isActiveTab ? '#A5B4FC' : 'var(--text-subtle)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ maxHeight: '50vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {/* TAB 1: BASIC & CONTACT */}
            {activeTab === 'basic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Full Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Email Address * {isEdit && <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>(Read-only)</span>}
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onBlur={handleEmailBlur}
                    placeholder="alex.morgan@company.com"
                    required={!isEdit}
                    disabled={isEdit}
                    style={{
                      opacity: isEdit ? 0.6 : 1,
                      borderColor: emailError ? 'var(--accent-rose, #F43F5E)' : undefined,
                    }}
                  />
                  {emailError && (
                    <span style={{ display: 'block', fontSize: '0.78rem', color: '#F43F5E', marginTop: '0.35rem' }}>
                      {emailError}
                    </span>
                  )}
                </div>

                {/* Department & Job Title */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                      Department
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Engineering"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                      Job Title
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Software Engineer"
                    />
                  </div>
                </div>

                {/* Phone & Emergency Contact */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', alignItems: 'start' }}>
                  <PhoneInput
                    label="Phone Number"
                    value={phone}
                    onChange={(e164Val, valid) => {
                      setPhone(e164Val);
                      setIsPhoneValid(valid);
                    }}
                  />
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                      Emergency Contact
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={emergencyContact}
                      onChange={(e) => setEmergencyContact(e.target.value)}
                      placeholder="e.g. Mary (Spouse) +1 555-0199"
                    />
                  </div>
                </div>

                {/* Company & Address */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                      Company / Organization
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                      Address / Location
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. 123 Tech Blvd, Suite 400"
                    />
                  </div>
                </div>

                {/* Active Status (Only in Edit mode) */}
                {isEdit && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      background: 'rgba(255, 255, 255, 0.04)',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <input
                      type="checkbox"
                      id="is_active_checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label htmlFor="is_active_checkbox" style={{ fontSize: '0.85rem', color: 'var(--text-main)', cursor: 'pointer', userSelect: 'none' }}>
                      <strong>Active Account</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        Unchecking deactivates the employee and revokes active sessions immediately.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CAREER & EXPERIENCE */}
            {activeTab === 'career' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Total Years of Professional Experience
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    placeholder="e.g. 5+ Years, 8 Years"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Previously Worked Companies
                  </label>
                  <textarea
                    className="form-control"
                    value={previousCompanies}
                    onChange={(e) => setPreviousCompanies(e.target.value)}
                    placeholder="e.g. Google, Microsoft, Stripe (comma or line separated)"
                    rows={2}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '2px', display: 'block' }}>
                    Separate companies with commas or line breaks to display as badges.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Previous Roles & Designations
                  </label>
                  <textarea
                    className="form-control"
                    value={previousRoles}
                    onChange={(e) => setPreviousRoles(e.target.value)}
                    placeholder="e.g. Senior Software Engineer, Technical Lead"
                    rows={2}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Core Skills & Technologies
                  </label>
                  <textarea
                    className="form-control"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="e.g. React, TypeScript, Python, FastAPI, Docker, PostgreSQL"
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: EDUCATION & NOTES */}
            {activeTab === 'education' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Highest Academic Qualification / Degrees
                  </label>
                  <textarea
                    className="form-control"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    placeholder="e.g. B.S. in Computer Science (Stanford University, 2020)"
                    rows={2}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Professional Certifications & Licenses
                  </label>
                  <textarea
                    className="form-control"
                    value={certifications}
                    onChange={(e) => setCertifications(e.target.value)}
                    placeholder="e.g. AWS Certified Solutions Architect, PMP, Scrum Master"
                    rows={2}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    Internal Admin Notes
                  </label>
                  <textarea
                    className="form-control"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional internal HR notes, performance notes, or administrative remarks..."
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (isEdit ? 'Saving Changes...' : 'Creating Employee...')
                : (isEdit ? 'Save Changes' : 'Create Employee')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
