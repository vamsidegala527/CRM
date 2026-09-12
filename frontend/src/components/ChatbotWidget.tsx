'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { getAuthToken } from '../lib/api';

interface ChatbotWidgetProps {
  onCustomerChange?: () => void;
}

const SUGGESTED_QUICK_ACTIONS = [
  { icon: '📋', label: 'Show all my customers', prompt: 'Show all my customers' },
  { icon: '📊', label: 'How many customers do I have?', prompt: 'How many customers do I have?' },
  { icon: '➕', label: 'Add a new customer', prompt: 'I want to add a new customer' },
  { icon: '🔍', label: 'Find customer by company/name', prompt: 'Search for customers from Acme' },
  { icon: '✏️', label: 'Update customer information', prompt: 'How do I update a customer?' },
  { icon: '🗑️', label: 'Delete customer record', prompt: 'How do I delete a customer?' },
];

/**
 * Lightweight inline markdown renderer for bold, italics, inline code, and status badges.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Regex splitting by code tokens, bold tokens, italic tokens
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
      // Status highlight check
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
          return <div key={idx} style={{ height: '0.25rem' }} />;
        }

        // Headings ### or ##
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
                marginBottom: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>{title}</span>
            </div>
          );
        }

        // Bullet point lists (* or -)
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

        // Numbered lists (1. , 2. )
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
                  color: '#6366F1',
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

        // Regular paragraph line
        return <div key={idx}>{renderInlineMarkdown(line)}</div>;
      })}
    </div>
  );
}

export default function ChatbotWidget({ onCustomerChange }: ChatbotWidgetProps) {
  const [isOpen, setIsIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chat: any = useChat({
    api: '/api/chat',
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // Helper to extract text from Vercel AI SDK message formats
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

  // Get current timestamp formatted
  const formatTime = (date?: Date | string) => {
    try {
      const d = date ? new Date(date) : new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

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
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            width: isExpanded ? '620px' : '430px',
            maxWidth: 'calc(100vw - 32px)',
            height: isMinimized ? '64px' : '630px',
            maxHeight: 'calc(100vh - 40px)',
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '20px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255, 255, 255, 0.1) inset',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.15) 100%)',
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
                  <span>Online • Gemini 3.8 Flash</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {messages.length > 0 && !isMinimized && (
                <button
                  id="chatbot-clear-btn"
                  onClick={handleClearChat}
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
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                }}
              >
                {/* Welcome Empty State */}
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', margin: 'auto 0', padding: '0.5rem 0' }}>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
                        border: '1px solid rgba(99, 102, 241, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.75rem',
                        margin: '0 auto 1rem',
                        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)',
                      }}
                    >
                      👋
                    </div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F8FAFC', margin: '0 0 0.4rem' }}>
                      How can I help you today?
                    </h4>
                    <p style={{ fontSize: '0.825rem', color: '#94A3B8', margin: '0 auto 1.5rem', maxWidth: '340px', lineHeight: 1.5 }}>
                      Manage your customers naturally. You can ask to view, create, search, update, or delete customers.
                    </p>

                    {/* Quick Action Suggested Grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', textAlign: 'left' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#64748B',
                          letterSpacing: '0.06em',
                          paddingLeft: '0.2rem',
                        }}
                      >
                        Quick Actions:
                      </span>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isExpanded ? '1fr 1fr' : '1fr',
                          gap: '0.5rem',
                        }}
                      >
                        {SUGGESTED_QUICK_ACTIONS.map((item, idx) => (
                          <button
                            key={idx}
                            className="chatbot-quick-action-btn"
                            data-prompt={item.prompt}
                            onClick={() => handleSuggestedClick(item.prompt)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '12px',
                              padding: '0.65rem 0.9rem',
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
                              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{item.icon}</span>
                            <span style={{ fontWeight: 500 }}>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages Loop */}
                {messages.map((m) => {
                  const textContent = getMessageText(m);
                  const toolInvocations = Array.isArray(m.toolInvocations) ? m.toolInvocations : [];

                  // If empty assistant message with no text content and no tool invocation, hide
                  if (m.role === 'assistant' && !textContent.trim() && toolInvocations.length === 0) {
                    return null;
                  }

                  const isUser = m.role === 'user';

                  return (
                    <div
                      key={m.id}
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
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: isUser
                              ? 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)'
                              : 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            color: '#FFF',
                            fontWeight: 700,
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
                            : 'rgba(30, 41, 59, 0.75)',
                          border: isUser ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#FFFFFF',
                          boxShadow: isUser
                            ? '0 6px 18px rgba(79, 70, 229, 0.35)'
                            : '0 4px 16px rgba(0, 0, 0, 0.35)',
                        }}
                      >
                        {/* Formatted Content */}
                        {textContent && <FormattedMessageBody content={textContent} />}

                        {/* Interactive Tool Cards & Status Invocations */}
                        {toolInvocations.map((toolInvocation: any) => {
                          const toolCallId = toolInvocation.toolCallId;
                          const toolName = toolInvocation.toolName;

                          // Delete Confirmation Card
                          if (
                            toolName === 'deleteCustomer' &&
                            'result' in toolInvocation &&
                            toolInvocation.result?.requiresConfirmation
                          ) {
                            const { customerId, customerName } = toolInvocation.result;
                            return (
                              <div
                                key={toolCallId}
                                style={{
                                  marginTop: '0.85rem',
                                  padding: '1rem',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  borderRadius: '12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.65rem',
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

                          // General Tool Status Indicator (when streaming without text yet)
                          if (!textContent && toolInvocation.state === 'call') {
                            let label = 'Processing operation...';
                            if (toolName === 'getCustomers') label = '🔍 Searching customer database...';
                            if (toolName === 'createCustomer') label = '✨ Creating customer record...';
                            if (toolName === 'updateCustomer') label = '✏️ Updating customer record...';
                            if (toolName === 'deleteCustomer') label = '🗑️ Preparing deletion...';

                            return (
                              <div
                                key={toolCallId}
                                style={{
                                  fontSize: '0.785rem',
                                  color: '#A5B4FC',
                                  fontStyle: 'italic',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  padding: '0.2rem 0',
                                }}
                              >
                                <div
                                  style={{
                                    width: '12px',
                                    height: '12px',
                                    border: '2px solid rgba(99, 102, 241, 0.3)',
                                    borderTopColor: '#6366F1',
                                    borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite',
                                  }}
                                />
                                <span>{label}</span>
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Loading / Streaming Indicator */}
                {isLoading && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      color: '#94A3B8',
                      fontSize: '0.8rem',
                      padding: '0.25rem 0.5rem',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid rgba(99, 102, 241, 0.25)',
                        borderTopColor: '#818CF8',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <span>AI Assistant is analyzing & executing operations...</span>
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
                    <span>Error: {error.message || 'Failed to connect to AI assistant.'}</span>
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

              {/* Chat Input Form */}
              <form
                onSubmit={handleCustomSubmit}
                style={{
                  padding: '0.85rem 1rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(11, 15, 25, 0.85)',
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
        </div>
      )}
    </>
  );
}
