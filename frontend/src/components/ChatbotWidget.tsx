'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { getAuthToken } from '../lib/api';

interface ChatbotWidgetProps {
  onCustomerChange?: () => void;
}

// Initial quick action prompts for empty state
const STARTER_CATEGORIES = [
  {
    category: 'View & Search',
    items: [
      { icon: '📋', label: 'Show all my customers', prompt: 'Show all my customers' },
      { icon: '⚡', label: 'Show Active customers only', prompt: 'Show only my Active customers' },
      { icon: '🔍', label: 'Find customer by company/name', prompt: 'Search for customer Acme' },
    ],
  },
  {
    category: 'Manage & Add',
    items: [
      { icon: '➕', label: 'Add a new customer', prompt: 'I want to add a new customer' },
      { icon: '✏️', label: 'Update customer details', prompt: 'How do I update an existing customer?' },
      { icon: '🗑️', label: 'Safely delete a record', prompt: 'How do I delete a customer?' },
    ],
  },
  {
    category: 'Insights & Analytics',
    items: [
      { icon: '📊', label: 'Customer status overview', prompt: 'Give me a summary breakdown of my customers by status' },
      { icon: '🎯', label: 'How many Leads do I have?', prompt: 'How many customer Leads do I currently have?' },
    ],
  },
];

// Quick action chips bar above input
const QUICK_BAR_PROMPTS = [
  { icon: '📋', label: 'List All', prompt: 'Show all my customers' },
  { icon: '➕', label: 'New Customer', prompt: 'I want to add a new customer' },
  { icon: '⚡', label: 'Active', prompt: 'Show active customers' },
  { icon: '🎯', label: 'Leads', prompt: 'Show leads' },
  { icon: '📊', label: 'Stats', prompt: 'Give me a breakdown of all customers by status' },
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
 * Extracts ONLY customer details (omitting conversational explanations,
 * greetings, and confirmation text) from assistant response text or tool execution results.
 */
function extractCustomerDetails(cleanText: string, toolInvocations?: any[]): string {
  // 1. If tool invocation has structured customer data
  if (Array.isArray(toolInvocations)) {
    for (const inv of toolInvocations) {
      if (inv && inv.result) {
        // Multiple items from getCustomers
        if (Array.isArray(inv.result.items) && inv.result.items.length > 0) {
          if (inv.result.items.length === 1) {
            const c = inv.result.items[0];
            const lines: string[] = [];
            if (c.id) lines.push(`ID: ${c.id}`);
            if (c.name) lines.push(`Name: ${c.name}`);
            if (c.email) lines.push(`Email: ${c.email}`);
            if (c.company && c.company !== '-') lines.push(`Company: ${c.company}`);
            if (c.phone && c.phone !== '-') lines.push(`Phone: ${c.phone}`);
            if (c.status) lines.push(`Status: ${c.status}`);
            if (c.address && c.address !== '-') lines.push(`Address: ${c.address}`);
            if (c.notes && c.notes !== '-') lines.push(`Notes: ${c.notes}`);
            return lines.join('\n');
          }
          return inv.result.items
            .map((c: any, i: number) => {
              const parts: string[] = [];
              if (c.id) parts.push(`ID: ${c.id}`);
              if (c.name) parts.push(`Name: ${c.name}`);
              if (c.email) parts.push(`Email: ${c.email}`);
              if (c.company && c.company !== '-') parts.push(`Company: ${c.company}`);
              if (c.phone && c.phone !== '-') parts.push(`Phone: ${c.phone}`);
              if (c.status) parts.push(`Status: ${c.status}`);
              return `${i + 1}. ` + parts.join(' | ');
            })
            .join('\n');
        }

        // Single customer from createCustomer, updateCustomer, getCustomer
        const c = inv.result.customer || (inv.result.name && inv.result.email ? inv.result : null);
        if (c && c.name) {
          const lines: string[] = [];
          if (c.id) lines.push(`ID: ${c.id}`);
          lines.push(`Name: ${c.name}`);
          if (c.email) lines.push(`Email: ${c.email}`);
          if (c.company && c.company !== '-') lines.push(`Company: ${c.company}`);
          if (c.phone && c.phone !== '-') lines.push(`Phone: ${c.phone}`);
          if (c.status) lines.push(`Status: ${c.status}`);
          if (c.address && c.address !== '-') lines.push(`Address: ${c.address}`);
          if (c.notes && c.notes !== '-') lines.push(`Notes: ${c.notes}`);
          return lines.join('\n');
        }
      }
    }
  }

  // 2. Parse text content
  const lines = (cleanText || '').split('\n').map((l) => l.trim());

  // Check for markdown table (like in user screenshot)
  const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (tableLines.length >= 2) {
    const headerRow = tableLines[0]
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    const dataRows = tableLines
      .slice(1)
      .filter((l) => !/^\|[\s\-:|]+\|$/.test(l)) // remove separator |---|---|
      .map((row) =>
        row
          .split('|')
          .map((c) => c.trim().replace(/\*\*/g, ''))
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      );

    if (dataRows.length === 1 && headerRow.length > 0) {
      const row = dataRows[0];
      const customerInfo: string[] = [];
      headerRow.forEach((header, idx) => {
        const val = row[idx];
        if (val && val !== '-' && val !== 'None' && val !== 'null') {
          customerInfo.push(`${header}: ${val}`);
        }
      });
      if (customerInfo.length > 0) {
        return customerInfo.join('\n');
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

  // Check for bullet points with customer attributes
  const fieldRegex = /^(?:[-*•]\s*)?(?:\*\*)?(name|email|phone|company|status|address|notes|customer\s*id|id)(?:\*\*)?\s*:\s*(.+)$/i;
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
 * Rich Interactive Card for Created/Updated/Retrieved Customer Records.
 */
function CustomerResultCard({
  customer,
  actionType,
  onAction,
}: {
  customer: any;
  actionType: 'created' | 'updated' | 'viewed';
  onAction: (prompt: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!customer || (!customer.id && !customer.name)) return null;

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    Active: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34D399', border: 'rgba(16, 185, 129, 0.35)' },
    Lead: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60A5FA', border: 'rgba(59, 130, 246, 0.35)' },
    Prospect: { bg: 'rgba(168, 85, 247, 0.15)', text: '#C084FC', border: 'rgba(168, 85, 247, 0.35)' },
    Inactive: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9CA3AF', border: 'rgba(156, 163, 175, 0.35)' },
  };

  const status = customer.status || 'Active';
  const colors = statusColors[status] || statusColors.Active;

  const initials = (customer.name || 'C')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (customer.email) {
      navigator.clipboard.writeText(customer.email);
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
          <span style={{ fontSize: '0.85rem' }}>
            {actionType === 'created' ? '✅ Customer Created' : actionType === 'updated' ? '🔄 Customer Updated' : '👤 Customer Details'}
          </span>
        </div>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '0.725rem',
            fontWeight: 700,
          }}
        >
          {status}
        </span>
      </div>

      {/* Main Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
            fontWeight: 800,
            color: '#FFFFFF',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.925rem', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {customer.name}
            </span>
            {customer.id && (
              <span style={{ fontSize: '0.7rem', color: '#818CF8', background: 'rgba(99, 102, 241, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                #{customer.id}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.775rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
            <span>✉️ {customer.email || 'No email'}</span>
            {customer.email && (
              <button
                type="button"
                onClick={handleCopyEmail}
                title="Copy email address"
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? '#34D399' : '#818CF8',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  padding: '1px 4px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
          {customer.company && (
            <div style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: '1px' }}>
              🏢 {customer.company}
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Footer */}
      <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.5rem' }}>
        <button
          type="button"
          onClick={() => onAction(`Show full details for customer #${customer.id}`)}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '0.35rem 0.6rem',
            color: '#E2E8F0',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
        >
          👁️ Details
        </button>
        <button
          type="button"
          onClick={() => onAction(`Update customer #${customer.id} with new details:`)}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '0.35rem 0.6rem',
            color: '#E2E8F0',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
        >
          ✏️ Edit
        </button>
        <button
          type="button"
          onClick={() => onAction(`Delete customer #${customer.id}`)}
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '0.35rem 0.6rem',
            color: '#FCA5A5',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default function ChatbotWidget({ onCustomerChange }: ChatbotWidgetProps) {
  const [isOpen, setIsIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = JSON.parse(localStorage.getItem('crm_chat_widget_state') || '{}');
        if (typeof state.isOpen === 'boolean') return state.isOpen;
      } catch (e) {}
    }
    return false;
  });
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = JSON.parse(localStorage.getItem('crm_chat_widget_state') || '{}');
        if (typeof state.isMinimized === 'boolean') return state.isMinimized;
      } catch (e) {}
    }
    return false;
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = JSON.parse(localStorage.getItem('crm_chat_widget_state') || '{}');
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

  const chat: any = useChat({
    api: '/api/chat',
    initialMessages: (() => {
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('crm_chat_history');
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
      if (onCustomerChange) {
        onCustomerChange();
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
          'crm_chat_widget_state',
          JSON.stringify({ isOpen, isMinimized, isExpanded })
        );
      } catch (e) {}
    }
  }, [isOpen, isMinimized, isExpanded]);

  // Fallback hydration for messages if initialMessages didn't populate
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('crm_chat_history');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0 && messages.length === 0) {
            setMessages(parsed);
          }
        }
      } catch (e) {}
    }
  }, []);

  // Save chat conversation history to localStorage on update
  useEffect(() => {
    if (typeof window !== 'undefined' && messages && messages.length > 0) {
      try {
        localStorage.setItem('crm_chat_history', JSON.stringify(messages));
      } catch (e) {
        console.error('Failed to save chat history', e);
      }
    }
  }, [messages]);

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
      localStorage.removeItem('crm_chat_history');
    }
  };

  const handleConfirmDelete = (customerId: number, customerName: string) => {
    append({
      role: 'user',
      content: `Yes, confirm deletion of customer "${customerName}" (ID #${customerId}). Delete permanently.`,
    });
  };

  const handleCancelDelete = (customerName: string) => {
    append({
      role: 'user',
      content: `Cancel deletion of customer "${customerName}".`,
    });
  };

  const handleCopyMessage = (msgId: string, text: string, toolInvocations?: any[]) => {
    const customerDetails = extractCustomerDetails(text, toolInvocations);
    navigator.clipboard.writeText(customerDetails);
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
          aria-label="Open AI Customer Assistant"
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
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC', margin: 0, letterSpacing: '-0.01em' }}>
                  Customer Assistant
                </h3>
                <div style={{ fontSize: '0.7rem', color: '#34D399', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '1px' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#34D399',
                      boxShadow: '0 0 6px #34D399',
                    }}
                  />
                  <span>Online • High Speed Groq AI</span>
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
                      Manage your customer database naturally with AI. Ask questions, create contacts, search, update statuses, or get instant insights.
                    </p>

                    {/* Categorized Starters */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', textAlign: 'left' }}>
                      {STARTER_CATEGORIES.map((cat, catIdx) => (
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
                          {isUser ? 'You' : 'Customer Assistant'}
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

                          // Delete Confirmation Card
                          if (toolName === 'deleteCustomer' && hasResult && result?.requiresConfirmation) {
                            const { customerId, customerName } = result;
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
                                  Are you sure you want to permanently delete customer <strong>{customerName}</strong> (ID #{customerId})? This action cannot be undone.
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                  <button
                                    className="chatbot-confirm-delete-btn"
                                    onClick={() => handleConfirmDelete(customerId, customerName)}
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
                                    onClick={() => handleCancelDelete(customerName)}
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
                                    Keep Customer
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          // Rich Customer Card on createCustomer
                          if (toolName === 'createCustomer' && hasResult && result && (result.id || result.email)) {
                            return (
                              <CustomerResultCard
                                key={toolCallId}
                                customer={result}
                                actionType="created"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // Rich Customer Card on updateCustomer
                          if (toolName === 'updateCustomer' && hasResult && result && (result.id || result.email)) {
                            return (
                              <CustomerResultCard
                                key={toolCallId}
                                customer={result}
                                actionType="updated"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // Rich Customer Card on getCustomer
                          if (toolName === 'getCustomer' && hasResult && result && (result.id || result.email)) {
                            return (
                              <CustomerResultCard
                                key={toolCallId}
                                customer={result}
                                actionType="viewed"
                                onAction={handleSuggestedClick}
                              />
                            );
                          }

                          // General Tool Status Indicator during execution
                          if (!rawText && toolInvocation.state === 'call') {
                            let label = 'Processing operation...';
                            if (toolName === 'getCustomers') label = '🔍 Searching customer database...';
                            if (toolName === 'createCustomer') label = '✨ Creating customer record...';
                            if (toolName === 'updateCustomer') label = '✏️ Updating customer record...';
                            if (toolName === 'deleteCustomer') label = '🗑️ Checking customer record...';

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

                        {/* Copy customer details button (for assistant messages) */}
                        {!isUser && cleanText && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.45rem' }}>
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(m.id || String(mIndex), cleanText, toolInvocations)}
                              title="Copy customer details only"
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
                    <span>{error.message || 'The AI assistant encountered a processing error. Please try again.'}</span>
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

              {/* Quick Actions Scroll Bar (active during conversation) */}
              {messages.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '0.45rem',
                    padding: '0.45rem 0.9rem',
                    background: 'rgba(15, 23, 42, 0.85)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    scrollbarWidth: 'none',
                  }}
                >
                  {QUICK_BAR_PROMPTS.map((q, qIdx) => (
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
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
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
