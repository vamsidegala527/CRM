'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { api, getAuthToken } from '../lib/api';
import { formatUserFriendlyError } from '../lib/errorUtils';
import { User } from '../types/employee';

interface ChatbotWidgetProps {
  user?: User | null;
  onEmployeeChange?: () => void;
  onProfileUpdate?: (updatedUser: User) => void;
}

// Initial quick action prompts for HR/Admin empty state
const ADMIN_STARTER_CATEGORIES = [
  {
    category: 'Directory & Search',
    items: [
      { icon: '👥', label: 'Show all employees', prompt: 'Show all employees in the directory' },
      { icon: '⚡', label: 'Show Active staff only', prompt: 'Show only active employees' },
      { icon: '⏳', label: 'Show Setup Pending staff', prompt: 'Show employees who have setup pending' },
    ],
  },
  {
    category: 'HR Management & Onboarding',
    items: [
      { icon: '➕', label: 'Add a new employee', prompt: 'I want to add a new employee' },
      { icon: '✏️', label: 'Update employee profile', prompt: 'How do I update an employee profile?' },
      { icon: '⏸️', label: 'Deactivate an employee', prompt: 'How do I deactivate an employee account?' },
    ],
  },
  {
    category: 'Organizational Insights',
    items: [
      { icon: '📊', label: 'Employee metrics overview', prompt: 'Give me a summary of total employees, active staff, and setup status' },
      { icon: '🎯', label: 'Staff breakdown by department', prompt: 'Break down our employees by department' },
    ],
  },
];

// Initial quick action prompts for Employee Self-Service empty state
const EMPLOYEE_STARTER_CATEGORIES = [
  {
    category: 'My Profile & Information',
    items: [
      { icon: '👤', label: 'View my full profile', prompt: 'Show my full employee profile details' },
      { icon: '🏢', label: 'My department & title', prompt: 'What department and job title am I assigned to?' },
      { icon: '📊', label: 'Account onboarding status', prompt: 'Check my account setup and onboarding status' },
    ],
  },
  {
    category: 'Update Contact Details',
    items: [
      { icon: '📞', label: 'Update my phone number', prompt: 'Help me update my contact phone number' },
      { icon: '📍', label: 'Update my address', prompt: 'Help me update my residential or work address' },
      { icon: '✏️', label: 'Update profile information', prompt: 'I want to update my profile details' },
    ],
  },
  {
    category: 'Security & Portal Help',
    items: [
      { icon: '🔒', label: 'How to change password', prompt: 'How do I change my account password?' },
      { icon: '💡', label: 'Self-service features', prompt: 'What actions and self-service features can I use in the portal?' },
    ],
  },
];

// Quick action chips bar above input (Admin)
const ADMIN_QUICK_BAR_PROMPTS = [
  { icon: '👥', label: 'Directory', prompt: 'Show all employees' },
  { icon: '➕', label: 'Add Employee', prompt: 'I want to add a new employee' },
  { icon: '⚡', label: 'Active', prompt: 'Show active employees' },
  { icon: '⏳', label: 'Pending', prompt: 'Show employees with setup pending' },
  { icon: '📊', label: 'HR Metrics', prompt: 'Give me a summary of all employee metrics' },
];

// Quick action chips bar above input (Employee)
const EMPLOYEE_QUICK_BAR_PROMPTS = [
  { icon: '👤', label: 'My Profile', prompt: 'Show my employee profile details' },
  { icon: '📞', label: 'Update Phone', prompt: 'I want to update my phone number' },
  { icon: '📍', label: 'Update Address', prompt: 'I want to update my address' },
  { icon: '🏢', label: 'Department', prompt: 'What department and title am I assigned to?' },
  { icon: '🔒', label: 'Password Help', prompt: 'How do I change my password?' },
];

/**
 * Extracts structured [SUGGESTIONS: "..."] from assistant markdown output.
 */
function extractSuggestions(rawText: string): { cleanText: string; suggestions: string[] } {
  if (!rawText) return { cleanText: '', suggestions: [] };

  const match = rawText.match(/\[SUGGESTIONS?:\s*([^[\]]+)\]/i);
  if (!match) {
    return { cleanText: rawText, suggestions: [] };
  }

  const cleanText = rawText.replace(/\[SUGGESTIONS?:\s*([^[\]]+)\]/i, '').trimEnd();
  const rawList = match[1].trim();

  try {
    if (rawList.startsWith('[') && rawList.endsWith(']')) {
      const parsed = JSON.parse(rawList);
      return { cleanText, suggestions: Array.isArray(parsed) ? parsed : [] };
    }
    const items = rawList
      .split(/,\s*(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((s) => s.replace(/^["']|["']$/g, '').trim())
      .filter((s) => s.length > 0);
    return { cleanText, suggestions: items };
  } catch {
    return { cleanText, suggestions: [] };
  }
}

/**
 * Extracts ONLY employee details (omitting conversational explanations,
 * greetings, and confirmation text) from assistant response text or tool execution results.
 */
function extractEmployeeDetails(cleanText: string, toolInvocations?: any[]): string {
  // 1. If tool invocation has structured employee data
  if (Array.isArray(toolInvocations)) {
    for (const inv of toolInvocations) {
      if (inv && inv.result) {
        // Multiple items from getEmployees
        if (Array.isArray(inv.result.items) && inv.result.items.length > 0) {
          if (inv.result.items.length === 1) {
            const e = inv.result.items[0];
            const lines: string[] = [];
            if (e.id) lines.push(`ID: ${e.id}`);
            if (e.full_name) lines.push(`Name: ${e.full_name}`);
            if (e.email) lines.push(`Email: ${e.email}`);
            if (e.department && e.department !== '-') lines.push(`Department: ${e.department}`);
            if (e.job_title && e.job_title !== '-') lines.push(`Job Title: ${e.job_title}`);
            if (e.company && e.company !== '-') lines.push(`Company: ${e.company}`);
            if (e.phone && e.phone !== '-') lines.push(`Phone: ${e.phone}`);
            lines.push(`Status: ${e.is_active ? 'Active' : 'Inactive'} | ${e.is_setup_complete ? 'Setup Complete' : 'Setup Pending'}`);
            return lines.join('\n');
          }
          return inv.result.items
            .map((e: any, i: number) => {
              const parts: string[] = [];
              if (e.id) parts.push(`ID: ${e.id}`);
              if (e.full_name) parts.push(`Name: ${e.full_name}`);
              if (e.email) parts.push(`Email: ${e.email}`);
              if (e.department && e.department !== '-') parts.push(`Dept: ${e.department}`);
              if (e.job_title && e.job_title !== '-') parts.push(`Title: ${e.job_title}`);
              parts.push(e.is_active ? 'Active' : 'Inactive');
              return `${i + 1}. ` + parts.join(' | ');
            })
            .join('\n');
        }

        // Single employee from createEmployee, updateEmployee, getEmployee, reactivateEmployee
        const emp = inv.result.employee || (inv.result.full_name && inv.result.email ? inv.result : null);
        if (emp && emp.full_name) {
          const lines: string[] = [];
          if (emp.id) lines.push(`ID: ${emp.id}`);
          lines.push(`Name: ${emp.full_name}`);
          if (emp.email) lines.push(`Email: ${emp.email}`);
          if (emp.department && emp.department !== '-') lines.push(`Department: ${emp.department}`);
          if (emp.job_title && emp.job_title !== '-') lines.push(`Job Title: ${emp.job_title}`);
          if (emp.company && emp.company !== '-') lines.push(`Company: ${emp.company}`);
          if (emp.phone && emp.phone !== '-') lines.push(`Phone: ${emp.phone}`);
          lines.push(`Status: ${emp.is_active ? 'Active' : 'Inactive'} | ${emp.is_setup_complete ? 'Setup Complete' : 'Setup Pending'}`);
          return lines.join('\n');
        }
      }
    }
  }

  // 2. Parse text content
  const lines = (cleanText || '').split('\n').map((l) => l.trim());

  // Check for markdown table
  const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (tableLines.length >= 2) {
    const headerRow = tableLines[0]
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    const dataRows = tableLines
      .slice(1)
      .filter((l) => !/^\|[\s\-:|]+\|$/.test(l))
      .map((row) =>
        row
          .split('|')
          .map((c) => c.trim().replace(/\*\*/g, ''))
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      );

    if (dataRows.length === 1 && headerRow.length > 0) {
      const row = dataRows[0];
      const empInfo: string[] = [];
      headerRow.forEach((header, idx) => {
        const val = row[idx];
        if (val && val !== '-' && val !== 'None' && val !== 'null') {
          empInfo.push(`${header}: ${val}`);
        }
      });
      if (empInfo.length > 0) {
        return empInfo.join('\n');
      }
    } else if (dataRows.length > 1 && headerRow.length > 0) {
      return dataRows
        .map((row, i) => {
          const parts: string[] = [];
          headerRow.forEach((header, idx) => {
            const val = row[idx];
            if (val && val !== '-' && val !== 'None') {
              parts.push(`${header}: ${val}`);
            }
          });
          return `${i + 1}. ` + parts.join(' | ');
        })
        .join('\n');
    }

    const nonSeparator = tableLines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
    return nonSeparator.join('\n');
  }

  // Check for bullet points with employee attributes
  const fieldRegex = /^(?:[-*•]\s*)?(?:\*\*)?(name|full[\s_]name|email|phone|department|job[\s_]title|company|status|address|notes|employee\s*id|id)(?:\*\*)?\s*:\s*(.+)$/i;
  const matchedFields: string[] = [];
  for (const line of lines) {
    const m = line.match(fieldRegex);
    if (m) {
      const key = m[1].replace(/\*\*/g, '').trim();
      const val = m[2].replace(/\*\*/g, '').replace(/`/g, '').trim();
      matchedFields.push(key.charAt(0).toUpperCase() + key.slice(1) + ': ' + val);
    }
  }
  if (matchedFields.length > 0) {
    return matchedFields.join('\n');
  }

  return cleanText;
}

/**
 * Lightweight inline markdown renderer for bold, italics, inline code, and status badges.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1);
      return (
        <code
          key={index}
          style={{
            background: 'rgba(99, 102, 241, 0.18)',
            color: '#C7D2FE',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.825em',
            border: '1px solid rgba(99, 102, 241, 0.3)',
          }}
        >
          {code}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      if (['Active', 'Lead', 'Prospect', 'Inactive'].includes(boldText)) {
        const bgColors: Record<string, string> = {
          Active: 'rgba(16, 185, 129, 0.2)',
          Lead: 'rgba(59, 130, 246, 0.2)',
          Prospect: 'rgba(168, 85, 247, 0.2)',
          Inactive: 'rgba(156, 163, 175, 0.2)',
        };
        const textColors: Record<string, string> = {
          Active: '#34D399',
          Lead: '#60A5FA',
          Prospect: '#C084FC',
          Inactive: '#9CA3AF',
        };
        return (
          <span
            key={index}
            style={{
              background: bgColors[boldText] || 'rgba(99, 102, 241, 0.2)',
              color: textColors[boldText] || '#FFFFFF',
              padding: '1px 7px',
              borderRadius: '999px',
              fontSize: '0.8em',
              fontWeight: 700,
              display: 'inline-block',
              margin: '0 2px',
              border: `1px solid ${textColors[boldText] || '#818CF8'}40`,
            }}
          >
            {boldText}
          </span>
        );
      }
      return (
        <strong key={index} style={{ color: '#F1F5F9', fontWeight: 700 }}>
          {boldText}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={index} style={{ color: '#E2E8F0', fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}

/**
 * Formats multi-line text into styled paragraphs, headings, and bullet points.
 */
function FormattedMessageBody({ content }: { content: string }) {
  const lines = useMemo(() => content.split('\n'), [content]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.875rem', lineHeight: 1.55 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} style={{ height: '0.2rem' }} />;
        }

        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const title = trimmed.replace(/^#{2,3}\s+/, '');
          return (
            <div
              key={idx}
              style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: '#F8FAFC',
                marginTop: '0.4rem',
                marginBottom: '0.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>{title}</span>
            </div>
          );
        }

        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const itemText = trimmed.slice(2);
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                paddingLeft: '0.25rem',
              }}
            >
              <span
                style={{
                  color: '#818CF8',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  userSelect: 'none',
                }}
              >
                •
              </span>
              <div style={{ flex: 1 }}>{renderInlineMarkdown(itemText)}</div>
            </div>
          );
        }

        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          const num = numberedMatch[1];
          const text = numberedMatch[2];
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                paddingLeft: '0.25rem',
              }}
            >
              <span
                style={{
                  color: '#818CF8',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  minWidth: '1.2rem',
                  lineHeight: '1.5',
                }}
              >
                {num}.
              </span>
              <div style={{ flex: 1 }}>{renderInlineMarkdown(text)}</div>
            </div>
          );
        }

        return <div key={idx}>{renderInlineMarkdown(line)}</div>;
      })}
    </div>
  );
}

/**
 * Rich Interactive Card for Created/Updated/Retrieved Employee Records.
 */
function EmployeeResultCard({
  employee,
  actionType,
  onAction,
}: {
  employee: any;
  actionType: 'created' | 'updated' | 'viewed' | 'reactivated';
  onAction: (prompt: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!employee || (!employee.id && !employee.full_name && !employee.email)) return null;

  const isActive = employee.is_active !== false;
  const isSetupComplete = Boolean(employee.is_setup_complete);
  const name = employee.full_name || employee.name || 'Employee';

  const initials = name
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (employee.email) {
      navigator.clipboard.writeText(employee.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div
      style={{
        marginTop: '0.65rem',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        borderRadius: '14px',
        padding: '0.85rem 1rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            {actionType === 'created' ? '✨ Employee Added' : actionType === 'updated' ? '🔄 Profile Updated' : actionType === 'reactivated' ? '⚡ Account Reactivated' : '👤 Employee Profile'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <span
            style={{
              background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isActive ? '#34D399' : '#FCA5A5',
              border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.725rem',
              fontWeight: 700,
            }}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
          <span
            style={{
              background: isSetupComplete ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: isSetupComplete ? '#A5B4FC' : '#FCD34D',
              border: `1px solid ${isSetupComplete ? 'rgba(99, 102, 241, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.725rem',
              fontWeight: 700,
            }}
          >
            {isSetupComplete ? 'Setup Complete' : 'Setup Pending'}
          </span>
        </div>
      </div>

      {/* Main Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.95rem',
            color: '#FFFFFF',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.925rem', color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </span>
            {employee.id && (
              <span style={{ fontSize: '0.725rem', color: '#64748B', fontFamily: 'monospace' }}>
                #{employee.id}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.785rem', color: '#94A3B8', marginTop: '2px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ✉️ {employee.email || 'No email'}
            </span>
            {employee.email && (
              <button
                type="button"
                onClick={handleCopyEmail}
                title="Copy Email"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '1px 3px',
                  color: copied ? '#34D399' : '#818CF8',
                  fontSize: '0.725rem',
                }}
              >
                {copied ? '✓' : '📋'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Extra details row */}
      {(employee.department || employee.job_title || employee.phone) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem', color: '#CBD5E1', background: 'rgba(0, 0, 0, 0.2)', padding: '0.35rem 0.6rem', borderRadius: '8px' }}>
          {employee.department && (
            <span>🏷️ <strong>Dept:</strong> {employee.department}</span>
          )}
          {employee.job_title && (
            <span>💼 <strong>Title:</strong> {employee.job_title}</span>
          )}
          {employee.phone && (
            <span>📞 {employee.phone}</span>
          )}
        </div>
      )}

      {/* Quick Action Chips */}
      <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.15rem' }}>
        <button
          type="button"
          onClick={() => onAction(`Show full profile for employee #${employee.id || name}`)}
          style={{
            flex: 1,
            padding: '0.4rem 0.5rem',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '8px',
            color: '#A5B4FC',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.28)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)')}
        >
          👁️ Profile
        </button>
        <button
          type="button"
          onClick={() => onAction(`Update employee #${employee.id || name} with department: `)}
          style={{
            flex: 1,
            padding: '0.4rem 0.5rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            color: '#E2E8F0',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
        >
          ✏️ Edit
        </button>
        <button
          type="button"
          onClick={() => onAction(`Deactivate employee #${employee.id || name}`)}
          style={{
            padding: '0.4rem 0.65rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#FCA5A5',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
        >
          ⏸️
        </button>
      </div>
    </div>
  );
}

export default function ChatbotWidget({ user, onEmployeeChange, onProfileUpdate }: ChatbotWidgetProps) {
  const isEmployee = user?.role === 'employee';
  const userRole = user?.role || 'guest';
  const userId = user?.id ?? 'anon';
  const chatHistoryKey = `hr_chat_history_${userRole}_${userId}`;
  const widgetStateKey = `hr_chat_widget_state_${userId}`;

  const starterCategories = isEmployee ? EMPLOYEE_STARTER_CATEGORIES : ADMIN_STARTER_CATEGORIES;
  const quickBarPrompts = isEmployee ? EMPLOYEE_QUICK_BAR_PROMPTS : ADMIN_QUICK_BAR_PROMPTS;

  const [isOpen, setIsIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = JSON.parse(localStorage.getItem(widgetStateKey) || localStorage.getItem('hr_chat_widget_state') || '{}');
        if (typeof state.isOpen === 'boolean') return state.isOpen;
      } catch (e) {}
    }
    return false;
  });
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = JSON.parse(localStorage.getItem(widgetStateKey) || '{}');
        if (typeof state.isMinimized === 'boolean') return state.isMinimized;
      } catch (e) {}
    }
    return false;
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = JSON.parse(localStorage.getItem(widgetStateKey) || '{}');
        if (typeof state.isExpanded === 'boolean') return state.isExpanded;
      } catch (e) {}
    }
    return false;
  });
  const [input, setInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/chat')
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then((data) => {
        if (isMounted) {
          setIsAvailable(Boolean(data?.available));
        }
      })
      .catch(() => {
        if (isMounted) setIsAvailable(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const quickBarRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const chat: any = useChat({
    api: '/api/chat',
    initialMessages: (() => {
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem(chatHistoryKey);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch (e) {}
      }
      return [];
    })(),
    headers: () => {
      const token = getAuthToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    fetch: (url: RequestInfo | URL, init?: RequestInit) => {
      const token = getAuthToken();
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return fetch(url, { ...init, headers, credentials: 'same-origin' });
    },
    onFinish: () => {
      if (onEmployeeChange) {
        onEmployeeChange();
      }
      if (isEmployee && onProfileUpdate) {
        api.getCurrentUser().then((u) => {
          onProfileUpdate(u);
        }).catch(() => {});
      }
    },
  } as any);

  const messages: any[] = chat.messages || [];
  const status: string = chat.status || 'ready';
  const error: any = chat.error;
  const setMessages: any = chat.setMessages || (() => {});
  const append: any = chat.append || chat.sendMessage || ((msg: any) => {
    if (chat.handleSubmit) chat.handleSubmit(msg);
  });
  const reload: any = chat.reload || (() => {});

  // Persist chat widget window state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          widgetStateKey,
          JSON.stringify({ isOpen, isMinimized, isExpanded })
        );
      } catch (e) {}
    }
  }, [isOpen, isMinimized, isExpanded, widgetStateKey]);

  // Hydration for messages when user/chatHistoryKey changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(chatHistoryKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
          }
        } else {
          setMessages([]);
        }
      } catch (e) {}
    }
  }, [chatHistoryKey]);

  // Save chat conversation history to localStorage on update
  useEffect(() => {
    if (typeof window !== 'undefined' && messages && messages.length > 0) {
      try {
        localStorage.setItem(chatHistoryKey, JSON.stringify(messages));
      } catch (e) {
        console.error('Failed to save chat history', e);
      }
    }
  }, [messages, chatHistoryKey]);

  const isLoading = status === 'submitted' || status === 'streaming' || chat.isLoading;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    append({
      role: 'user',
      content: text,
    });
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized, isLoading]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  const checkQuickBarScroll = useCallback(() => {
    const el = quickBarRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkQuickBarScroll();
    const timer = setTimeout(checkQuickBarScroll, 100);
    const handleResize = () => checkQuickBarScroll();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [messages, isOpen, isExpanded, checkQuickBarScroll]);

  const scrollQuickBar = (direction: 'left' | 'right') => {
    const el = quickBarRef.current;
    if (!el) return;
    const scrollAmount = direction === 'left' ? -150 : 150;
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(checkQuickBarScroll, 250);
  };

  const handleSuggestedClick = (prompt: string) => {
    append({
      role: 'user',
      content: prompt,
    });
  };

  const handleClearChat = () => {
    setMessages([]);
    setShowClearConfirm(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(chatHistoryKey);
      localStorage.removeItem('crm_chat_history');
    }
  };

  const handleConfirmDelete = (employeeId: any, employeeName: string) => {
    append({
      role: 'user',
      content: `Yes, confirm permanent deletion of employee "${employeeName}" (ID #${employeeId}). Delete permanently.`,
    });
  };

  const handleCancelDelete = (employeeName: string) => {
    append({
      role: 'user',
      content: `Cancel deletion of employee "${employeeName}".`,
    });
  };

  const handleCopyMessage = (msgId: string, text: string, toolInvocations?: any[]) => {
    const employeeDetails = extractEmployeeDetails(text, toolInvocations);
    navigator.clipboard.writeText(employeeDetails);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Helper to extract clean text from Vercel AI SDK message formats
  const getMessageText = (msg: any): string => {
    if (typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content;
    }
    if (Array.isArray(msg.parts)) {
      const textParts = msg.parts
        .filter((p: any) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('');
      if (textParts.trim()) return textParts;
    }
    if (typeof msg.text === 'string' && msg.text.trim()) {
      return msg.text;
    }
    return '';
  };

  const formatTime = (date?: Date | string) => {
    try {
      const d = date ? new Date(date) : new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Remove / disable AI Assistant UI if backend is not available
  if (!isAvailable) {
    return null;
  }

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          id="open-chatbot-btn"
          onClick={() => {
            setIsIsOpen(true);
            setIsMinimized(false);
          }}
          aria-label="Open HR AI Assistant"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #06B6D4 100%)',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '50px',
            padding: '0.85rem 1.45rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(99, 102, 241, 0.45)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px) scale(1.03)';
            e.currentTarget.style.boxShadow = '0 14px 36px rgba(99, 102, 241, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(99, 102, 241, 0.45)';
          }}
        >
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>✨</span>
          <span>AI Assistant</span>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#34D399',
              boxShadow: '0 0 8px #34D399',
            }}
          />
        </button>
      )}

      {/* Floating Chat Overlay Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            width: isExpanded ? '660px' : '440px',
            maxWidth: 'calc(100vw - 28px)',
            height: isMinimized ? '64px' : '650px',
            maxHeight: 'calc(100vh - 36px)',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '20px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 1px rgba(255, 255, 255, 0.15) inset',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1), height 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1.2rem',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(6, 182, 212, 0.16) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontSize: '1rem',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                }}
              >
                ✨
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#F8FAFC', margin: 0, letterSpacing: '-0.01em' }}>
                    Nexus AI
                  </h3>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '0.12rem 0.45rem',
                      borderRadius: '6px',
                      background: isEmployee ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      color: isEmployee ? '#34D399' : '#A5B4FC',
                      border: `1px solid ${isEmployee ? 'rgba(16, 185, 129, 0.35)' : 'rgba(99, 102, 241, 0.35)'}`,
                    }}
                  >
                    {isEmployee ? 'Employee' : 'HR/Admin'}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '0.1rem' }}>
                  {isEmployee ? 'Self-Service Assistant' : 'HR & Directory Operations'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {messages.length > 0 && !isMinimized && !showClearConfirm && (
                <button
                  id="chatbot-clear-btn"
                  onClick={() => setShowClearConfirm(true)}
                  title="Clear conversation"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    padding: '0.35rem 0.6rem',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#F87171')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                >
                  🧹 Clear
                </button>
              )}

              {showClearConfirm && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(239, 68, 68, 0.18)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '2px 6px' }}>
                  <span style={{ fontSize: '0.725rem', color: '#FCA5A5' }}>Clear chat?</span>
                  <button
                    onClick={handleClearChat}
                    style={{ background: '#EF4444', color: '#FFF', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    style={{ background: 'none', color: '#E2E8F0', border: 'none', fontSize: '0.7rem', cursor: 'pointer' }}
                  >
                    No
                  </button>
                </div>
              )}

              <button
                id="chatbot-expand-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Compact View' : 'Expand View'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
              >
                {isExpanded ? '❐' : '⛶'}
              </button>
              <button
                id="chatbot-minimize-btn"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand' : 'Minimize'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '1.05rem',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
              >
                {isMinimized ? '🗖' : '🗕'}
              </button>
              <button
                id="chatbot-close-btn"
                onClick={() => setIsIsOpen(false)}
                title="Close assistant"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Main Body (if not minimized) */}
          {!isMinimized && (
            <>
              {/* Message List */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1.2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  position: 'relative',
                }}
              >
                {/* Welcome Empty State */}
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', margin: 'auto 0', padding: '0.5rem 0' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '18px',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%)',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.85rem',
                        margin: '0 auto 1rem',
                        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)',
                      }}
                    >
                      👋
                    </div>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#F8FAFC', margin: '0 0 0.35rem' }}>
                      How can I help you today?
                    </h4>
                    <p style={{ fontSize: '0.825rem', color: '#94A3B8', margin: '0 auto 1.4rem', maxWidth: '360px', lineHeight: 1.5 }}>
                      {isEmployee
                        ? 'Your personal AI Self-Service Assistant. View or update your contact profile, review your department information, or get help with your account.'
                        : 'Manage your workforce directory naturally with AI. Ask questions, view staff, search departments, or get instant HR insights.'}
                    </p>

                    {/* Categorized Starters */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', textAlign: 'left' }}>
                      {starterCategories.map((cat, catIdx) => (
                        <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <span
                            style={{
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: '#818CF8',
                              letterSpacing: '0.06em',
                              paddingLeft: '0.2rem',
                            }}
                          >
                            {cat.category}
                          </span>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: isExpanded ? '1fr 1fr 1fr' : '1fr',
                              gap: '0.45rem',
                            }}
                          >
                            {cat.items.map((item, itemIdx) => (
                              <button
                                key={itemIdx}
                                className="chatbot-quick-action-btn"
                                onClick={() => handleSuggestedClick(item.prompt)}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.035)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  borderRadius: '12px',
                                  padding: '0.65rem 0.85rem',
                                  color: '#E2E8F0',
                                  fontSize: '0.825rem',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.6rem',
                                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.16)';
                                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.035)';
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                              >
                                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{item.icon}</span>
                                <span style={{ fontWeight: 500, lineHeight: 1.3 }}>{item.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages Loop */}
                {messages.map((m, mIndex) => {
                  const rawText = getMessageText(m);
                  const toolInvocations = Array.isArray(m.toolInvocations) ? m.toolInvocations : [];

                  if (m.role === 'assistant' && !rawText.trim() && toolInvocations.length === 0) {
                    return null;
                  }

                  const isUser = m.role === 'user';
                  const { cleanText, suggestions } = isUser ? { cleanText: rawText, suggestions: [] } : extractSuggestions(rawText);
                  const isLatestAssistant = !isUser && mIndex === messages.length - 1;

                  return (
                    <div
                      key={m.id || mIndex}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start',
                        gap: '0.35rem',
                      }}
                    >
                      {/* Avatar + Label Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0 0.35rem',
                          flexDirection: isUser ? 'row-reverse' : 'row',
                        }}
                      >
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isUser
                              ? 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)'
                              : 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            color: '#FFF',
                            fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                          }}
                        >
                          {isUser ? '👤' : '✨'}
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8' }}>
                          {isUser ? 'You' : 'HR Assistant'}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                          {formatTime(m.createdAt)}
                        </span>
                      </div>

                      {/* Message Bubble Container */}
                      <div
                        style={{
                          maxWidth: isExpanded ? '85%' : '90%',
                          padding: '0.85rem 1.15rem',
                          borderRadius: isUser ? '20px 4px 20px 20px' : '4px 20px 20px 20px',
                          background: isUser
                            ? 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)'
                            : 'rgba(30, 41, 59, 0.82)',
                          border: isUser ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid rgba(255, 255, 255, 0.09)',
                          color: '#FFFFFF',
                          boxShadow: isUser
                            ? '0 6px 18px rgba(79, 70, 229, 0.35)'
                            : '0 4px 16px rgba(0, 0, 0, 0.35)',
                          position: 'relative',
                        }}
                      >
                        {/* Formatted Content */}
                        {cleanText && <FormattedMessageBody content={cleanText} />}

                        {/* Interactive Tool Cards & Status Invocations */}
                        {toolInvocations.map((toolInvocation: any) => {
                          const toolCallId = toolInvocation.toolCallId;
                          const toolName = toolInvocation.toolName;
                          const hasResult = 'result' in toolInvocation;
                          const result = toolInvocation.result;

                          // Permanent Deletion Confirmation Card
                          if (toolName === 'deleteEmployee' && hasResult && result?.requiresConfirmation) {
                            const employeeId = result.employeeId || result.id;
                            const employeeName = result.employeeName || result.name || 'Employee';
                            return (
                              <div
                                key={toolCallId}
                                style={{
                                  marginTop: '0.85rem',
                                  padding: '1rem',
                                  background: 'rgba(239, 68, 68, 0.14)',
                                  border: '1px solid rgba(239, 68, 68, 0.45)',
                                  borderRadius: '12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.65rem',
                                  boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#F87171', fontWeight: 700, fontSize: '0.875rem' }}>
                                  <span>⚠️</span>
                                  <span>Permanent Deletion Confirmation</span>
                                </div>
                                <div style={{ fontSize: '0.825rem', color: '#E2E8F0', lineHeight: 1.45 }}>
                                  Are you sure you want to permanently delete employee <strong>{employeeName}</strong> (ID #{employeeId})? This action cannot be undone.
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                  <button
                                    className="chatbot-confirm-delete-btn"
                                    onClick={() => handleConfirmDelete(employeeId, employeeName)}
                                    style={{
                                      flex: 1,
                                      padding: '0.5rem 0.75rem',
                                      background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                      color: '#FFFFFF',
                                      border: 'none',
                                      borderRadius: '8px',
                                      fontWeight: 700,
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '0.35rem',
                                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                                    }}
                                  >
                                    <span>🗑️</span>
                                    <span>Yes, Delete Permanently</span>
                                  </button>
                                  <button
                                    className="chatbot-cancel-delete-btn"
                                    onClick={() => handleCancelDelete(employeeName)}
                                    style={{
                                      flex: 1,
                                      padding: '0.5rem 0.75rem',
                                      background: 'rgba(255, 255, 255, 0.08)',
                                      color: '#E2E8F0',
                                      border: '1px solid rgba(255, 255, 255, 0.15)',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Keep Employee
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          // Rich Employee Card on createEmployee
                          if (toolName === 'createEmployee' && hasResult && result && (result.id || result.email || result.employee)) {
                            return (
                              <EmployeeResultCard
                                key={toolCallId}
                                employee={result.employee || result}
                                actionType="created"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // Rich Employee Card on updateEmployee
                          if (toolName === 'updateEmployee' && hasResult && result && (result.id || result.email || result.employee)) {
                            return (
                              <EmployeeResultCard
                                key={toolCallId}
                                employee={result.employee || result}
                                actionType="updated"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // Rich Employee Card on getEmployee
                          if (toolName === 'getEmployee' && hasResult && result && (result.id || result.email || result.employee)) {
                            return (
                              <EmployeeResultCard
                                key={toolCallId}
                                employee={result.employee || result}
                                actionType="viewed"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // Rich Employee Card on reactivateEmployee
                          if (toolName === 'reactivateEmployee' && hasResult && result && (result.id || result.email || result.employee)) {
                            return (
                              <EmployeeResultCard
                                key={toolCallId}
                                employee={result.employee || result}
                                actionType="reactivated"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // General Tool Status Indicator during execution
                          if (!rawText && toolInvocation.state === 'call') {
                            let label = 'Processing personnel operation...';
                            if (toolName === 'getEmployees') label = '🔍 Searching employee directory...';
                            if (toolName === 'getEmployee') label = '👤 Fetching employee profile...';
                            if (toolName === 'createEmployee') label = '✨ Adding new employee...';
                            if (toolName === 'updateEmployee') label = '✏️ Updating employee profile...';
                            if (toolName === 'deleteEmployee') label = '🗑️ Processing employee deactivation/deletion...';
                            if (toolName === 'reactivateEmployee') label = '⚡ Reactivating employee account...';
                            if (toolName === 'getEmployeeMetrics') label = '📊 Calculating organizational KPI metrics...';

                            return (
                              <div
                                key={toolCallId}
                                style={{
                                  fontSize: '0.785rem',
                                  color: '#A5B4FC',
                                  fontStyle: 'italic',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.45rem',
                                  padding: '0.25rem 0',
                                }}
                              >
                                <div
                                  style={{
                                    width: '12px',
                                    height: '12px',
                                    border: '2px solid rgba(99, 102, 241, 0.3)',
                                    borderTopColor: '#6366F1',
                                    borderRadius: '50%',
                                    animation: 'chatbotSpin 0.8s linear infinite',
                                  }}
                                />
                                <span>{label}</span>
                              </div>
                            );
                          }

                          return null;
                        })}

                        {/* Copy employee details button (for assistant messages) */}
                        {!isUser && cleanText && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.45rem' }}>
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(m.id || String(mIndex), cleanText, toolInvocations)}
                              title="Copy employee details only"
                              style={{
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                color: copiedMessageId === (m.id || String(mIndex)) ? '#34D399' : '#94A3B8',
                                cursor: 'pointer',
                                fontSize: '0.725rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                if (copiedMessageId !== (m.id || String(mIndex))) {
                                  e.currentTarget.style.color = '#CBD5E1';
                                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.35)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (copiedMessageId !== (m.id || String(mIndex))) {
                                  e.currentTarget.style.color = '#94A3B8';
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                }
                              }}
                            >
                              {copiedMessageId === (m.id || String(mIndex)) ? '✓ Copied Details' : '📋 Copy Details'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Contextual Suggestion Chips (rendered under the message) */}
                      {suggestions.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                            marginTop: '0.25rem',
                            paddingLeft: '0.25rem',
                          }}
                        >
                          {suggestions.map((suggestion, sIdx) => (
                            <button
                              key={sIdx}
                              type="button"
                              onClick={() => handleSuggestedClick(suggestion)}
                              style={{
                                background: 'rgba(99, 102, 241, 0.14)',
                                border: '1px solid rgba(99, 102, 241, 0.35)',
                                color: '#C7D2FE',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '999px',
                                fontSize: '0.775rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.14)';
                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.35)';
                                e.currentTarget.style.transform = 'translateY(0)';
                              }}
                            >
                              <span>{suggestion}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Modern Typing Wave Indicator */}
                {isLoading && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      padding: '0.6rem 0.95rem',
                      borderRadius: '16px',
                      width: 'fit-content',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span className="chatbot-typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818CF8', animation: 'typingWave 1.4s infinite ease-in-out', animationDelay: '0ms' }} />
                      <span className="chatbot-typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818CF8', animation: 'typingWave 1.4s infinite ease-in-out', animationDelay: '200ms' }} />
                      <span className="chatbot-typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818CF8', animation: 'typingWave 1.4s infinite ease-in-out', animationDelay: '400ms' }} />
                    </div>
                    <span style={{ fontSize: '0.785rem', color: '#CBD5E1', fontWeight: 500 }}>
                      AI Assistant is analyzing & executing operations...
                    </span>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#FCA5A5',
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.825rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <span>{formatUserFriendlyError(error, 'Something went wrong. Please try again.')}</span>
                    <button
                      onClick={() => reload()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#F87171',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {showScrollBottom && (
                <button
                  type="button"
                  onClick={() => scrollToBottom('smooth')}
                  title="Scroll to bottom"
                  style={{
                    position: 'absolute',
                    bottom: '80px',
                    right: '25px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#C7D2FE',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    zIndex: 10,
                  }}
                >
                  ↓
                </button>
              )}

              {/* Quick Actions Slide Bar (active during conversation) */}
              {messages.length > 0 && (
                <div
                  style={{
                    position: 'relative',
                    background: 'rgba(15, 23, 42, 0.9)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: '38px',
                  }}
                >
                  {/* Left Slide Arrow */}
                  {canScrollLeft && (
                    <button
                      type="button"
                      onClick={() => scrollQuickBar('left')}
                      title="Slide left"
                      aria-label="Previous quick actions"
                      style={{
                        position: 'absolute',
                        left: '4px',
                        zIndex: 4,
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(30, 41, 59, 0.95)',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        color: '#C7D2FE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
                        fontSize: '0.65rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.35)';
                        e.currentTarget.style.color = '#FFFFFF';
                        e.currentTarget.style.transform = 'scale(1.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.95)';
                        e.currentTarget.style.color = '#C7D2FE';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      &#9664;
                    </button>
                  )}

                  {/* Left Fade Gradient */}
                  {canScrollLeft && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '32px',
                        background: 'linear-gradient(to right, rgba(15, 23, 42, 0.95), transparent)',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                  )}

                  {/* Scrollable Container */}
                  <div
                    ref={quickBarRef}
                    onScroll={checkQuickBarScroll}
                    style={{
                      display: 'flex',
                      gap: '0.45rem',
                      padding: '0.45rem 0.9rem',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      width: '100%',
                      scrollBehavior: 'smooth',
                    }}
                  >
                    {quickBarPrompts.map((q, qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        onClick={() => handleSuggestedClick(q.prompt)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '999px',
                          padding: '0.25rem 0.65rem',
                          color: '#94A3B8',
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#FFFFFF';
                          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#94A3B8';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        }}
                      >
                        <span>{q.icon}</span>
                        <span>{q.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Right Fade Gradient */}
                  {canScrollRight && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '32px',
                        background: 'linear-gradient(to left, rgba(15, 23, 42, 0.95), transparent)',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                  )}

                  {/* Right Slide Arrow */}
                  {canScrollRight && (
                    <button
                      type="button"
                      onClick={() => scrollQuickBar('right')}
                      title="Slide right"
                      aria-label="Next quick actions"
                      style={{
                        position: 'absolute',
                        right: '4px',
                        zIndex: 4,
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(30, 41, 59, 0.95)',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        color: '#C7D2FE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
                        fontSize: '0.65rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.35)';
                        e.currentTarget.style.color = '#FFFFFF';
                        e.currentTarget.style.transform = 'scale(1.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.95)';
                        e.currentTarget.style.color = '#C7D2FE';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      &#9654;
                    </button>
                  )}
                </div>
              )}

              {/* Chat Input Form */}
              <form
                onSubmit={handleCustomSubmit}
                style={{
                  padding: '0.8rem 1rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(11, 15, 25, 0.9)',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <input
                    id="chatbot-input"
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Type a request (e.g. Add John, email john@acme.com)..."
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '12px',
                      padding: '0.75rem 2.2rem 0.75rem 0.95rem',
                      color: '#FFFFFF',
                      fontSize: '0.875rem',
                      outline: 'none',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  {input && (
                    <button
                      type="button"
                      onClick={() => setInput('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        padding: '2px',
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>

                <button
                  id="chatbot-submit-btn"
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  aria-label="Send message"
                  style={{
                    background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '0.75rem 1.15rem',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                    opacity: isLoading || !input.trim() ? 0.45 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    boxShadow: isLoading || !input.trim() ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && input.trim()) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(99, 102, 241, 0.55)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = isLoading || !input.trim() ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)';
                  }}
                >
                  <span>Send</span>
                  <span style={{ fontSize: '0.9rem' }}>➤</span>
                </button>
              </form>
            </>
          )}

          {/* Keyframe animation styles */}
          <style>{`
            @keyframes chatbotSpin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes typingWave {
              0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
              30% { transform: translateY(-4px); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
