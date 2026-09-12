import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const API_BASE_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function sanitizeMessages(rawMessages: any[]): any[] {
  if (!Array.isArray(rawMessages)) return [];
  const sanitized: any[] = [];

  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;

    let textContent = '';
    if (typeof m.content === 'string') {
      textContent = m.content;
    } else if (Array.isArray(m.content)) {
      textContent = m.content
        .filter((c: any) => c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
        .map((c: any) => c.text)
        .join('');
    } else if (Array.isArray(m.parts)) {
      textContent = m.parts
        .filter((p: any) => p && typeof p === 'object' && p.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('');
    }

    const toolInvocations = Array.isArray(m.toolInvocations) ? m.toolInvocations : [];

    if (toolInvocations.length > 0) {
      const parts: any[] = [];
      if (textContent.trim()) {
        parts.push({ type: 'text', text: textContent });
      }

      for (const inv of toolInvocations) {
        if (inv.toolCallId && inv.toolName) {
          parts.push({
            type: 'tool-call',
            toolCallId: inv.toolCallId,
            toolName: inv.toolName,
            args: inv.args || {},
          });
        }
      }

      if (parts.length > 0) {
        sanitized.push({ role, content: parts });

        for (const inv of toolInvocations) {
          if (inv.state === 'result' && inv.toolCallId && inv.toolName) {
            sanitized.push({
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: inv.toolCallId,
                  toolName: inv.toolName,
                  result: inv.result !== undefined ? inv.result : { success: true },
                },
              ],
            });
          }
        }
        continue;
      }
    }

    sanitized.push({
      role,
      content: textContent || (role === 'user' ? 'Hello' : ''),
    });
  }

  return sanitized.length > 0 ? sanitized : [{ role: 'user', content: 'Hello' }];
}

export async function POST(req: Request) {
  try {
    const { messages: rawMessages } = await req.json();
    const messages = sanitizeMessages(rawMessages);

    // 1. Try Authorization header (case-insensitive)
    let authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (authHeader && (authHeader.includes('null') || authHeader.includes('undefined'))) {
      authHeader = null;
    }
    
    // 2. Fallback: Try Cookie header
    if (!authHeader) {
      const cookieHeader = req.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|; )access_token=([^;]*)/);
        if (match) {
          const val = decodeURIComponent(match[1]);
          if (val && val !== 'null' && val !== 'undefined') {
            authHeader = `Bearer ${val}`;
          }
        }
      }
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Please log in to use customer management.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fetchBackend = async (endpoint: string, options: RequestInit = {}) => {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          ...(options.headers as Record<string, string> || {}),
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Backend API error: ${res.statusText}`);
      }
      return data;
    };

    const result = streamText({
      model: google('gemini-3.6-flash'),
      system: `You are an intelligent, friendly Customer Management AI Assistant embedded in the Customer Hub application.
Your mission is to help authenticated users manage their isolated customer database through natural language commands and questions.

CRITICAL BEHAVIOR & RULES:
1. ALWAYS maintain a professional, helpful, and concise tone.
2. CREATING CUSTOMERS:
   - "name" and "email" are MANDATORY fields.
   - If the user specifies a name but omits the email address (e.g. "Add Rahul as a customer"), DO NOT call createCustomer yet. Ask the user friendly to provide their email address.
   - Valid status values are: "Active", "Lead", "Prospect", "Inactive". Default is "Active".
3. READING & SEARCHING CUSTOMERS:
   - When asked to show, list, count, or find customers, use getCustomers.
   - For example: "Show my customers", "How many customers do I have?", "Find customers from Acme", "Show inactive customers".
4. UPDATING CUSTOMERS:
   - If the user asks to update a customer (e.g., "Change John's phone number to 9999999999"), search for "John" first using getCustomers to find their exact customer ID, then call updateCustomer.
   - If multiple customers match, ask the user to clarify which customer ID or email they mean.
5. DELETING CUSTOMERS:
   - Deletion is PERMANENT.
   - When the user asks to delete a customer (e.g., "Delete John Doe"), if they have NOT explicitly confirmed yet, set confirmed: false when calling deleteCustomer or ask for confirmation.
6. SECURITY & DATA ISOLATION:
   - All backend API calls automatically enforce user authentication and data isolation. Never reference other users' data.`,
      messages,
      stopWhen: stepCountIs(5),
      onError: (error: any) => {
        console.error('[streamText Execution Error]:', error);
      },
      tools: {
        getCustomers: tool({
          description: 'Fetch, search, filter, or count customers belonging to the authenticated user.',
          parameters: z.object({
            search: z.string().optional().describe('Search keyword matching name, email, company, or phone'),
            status: z.string().optional().describe('Filter by status: Active, Lead, Prospect, or Inactive'),
            page: z.number().optional().default(1),
            limit: z.number().optional().default(20),
          }),
          execute: async ({ search, status, page, limit }: any) => {
            try {
              const query = new URLSearchParams();
              if (search) query.append('search', search);
              if (status && status !== 'All') query.append('status', status);
              query.append('page', String(page || 1));
              query.append('limit', String(limit || 20));
              return await fetchBackend(`/api/customers?${query.toString()}`);
            } catch (err: any) {
              return { error: err.message || 'Failed to retrieve customers.' };
            }
          },
        } as any),

        getCustomer: tool({
          description: 'Get a specific customer record by customer ID.',
          parameters: z.object({
            customerId: z.number().describe('ID of the customer to retrieve'),
          }),
          execute: async ({ customerId }: any) => {
            try {
              return await fetchBackend(`/api/customers/${customerId}`);
            } catch (err: any) {
              return { error: err.message || `Customer #${customerId} not found.` };
            }
          },
        } as any),

        createCustomer: tool({
          description: 'Create a new customer record tied to the authenticated user.',
          parameters: z.object({
            name: z.string().describe('Full name of the customer'),
            email: z.string().describe('Customer email address'),
            phone: z.string().optional().describe('Phone number'),
            company: z.string().optional().describe('Company name'),
            status: z.enum(['Active', 'Lead', 'Prospect', 'Inactive']).optional().default('Active'),
            address: z.string().optional().describe('Physical address'),
            notes: z.string().optional().describe('Internal notes or observations'),
          }),
          execute: async (customerData: any) => {
            try {
              return await fetchBackend('/api/customers', {
                method: 'POST',
                body: JSON.stringify(customerData),
              });
            } catch (err: any) {
              return { error: err.message || 'Failed to create customer.' };
            }
          },
        } as any),

        updateCustomer: tool({
          description: 'Update an existing customer record by customer ID.',
          parameters: z.object({
            customerId: z.number().describe('ID of the customer to update'),
            name: z.string().optional().describe('New name'),
            email: z.string().optional().describe('New email address'),
            phone: z.string().optional().describe('New phone number'),
            company: z.string().optional().describe('New company name'),
            status: z.enum(['Active', 'Lead', 'Prospect', 'Inactive']).optional().describe('New status'),
            address: z.string().optional().describe('New address'),
            notes: z.string().optional().describe('New notes'),
          }),
          execute: async ({ customerId, ...updateFields }: any) => {
            try {
              return await fetchBackend(`/api/customers/${customerId}`, {
                method: 'PUT',
                body: JSON.stringify(updateFields),
              });
            } catch (err: any) {
              return { error: err.message || `Failed to update customer #${customerId}.` };
            }
          },
        } as any),

        deleteCustomer: tool({
          description: 'Delete a customer record by ID.',
          parameters: z.object({
            customerId: z.number().describe('ID of the customer to delete'),
            customerName: z.string().describe('Name of the customer'),
            confirmed: z.boolean().describe('Set to true only if the user explicitly confirmed deletion'),
          }),
          execute: async ({ customerId, customerName, confirmed }: any) => {
            if (!confirmed) {
              return {
                requiresConfirmation: true,
                customerId,
                customerName,
                message: `Are you sure you want to delete customer "${customerName}" (ID #${customerId})? This action cannot be undone.`,
              };
            }
            try {
              const res = await fetchBackend(`/api/customers/${customerId}`, {
                method: 'DELETE',
              });
              return {
                success: true,
                customerId,
                customerName,
                message: res.message || `Customer "${customerName}" deleted successfully.`,
              };
            } catch (err: any) {
              return { error: err.message || `Failed to delete customer #${customerId}.` };
            }
          },
        } as any),
      } as any,
    } as any);

    const formatStreamError = (error: any) => {
      const msg = error?.message || String(error || '');
      if (
        msg.includes('quota') ||
        msg.includes('Quota') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rate-limits')
      ) {
        return 'Google Gemini API quota limit reached. Please wait a brief moment before sending another message.';
      }
      if (msg.includes('Unauthorized') || msg.includes('token')) {
        return 'Authentication token missing or expired. Please sign in again.';
      }
      return 'The AI assistant encountered a processing error. Please try again.';
    };

    return typeof (result as any).toUIMessageStreamResponse === 'function'
      ? (result as any).toUIMessageStreamResponse({ onError: formatStreamError })
      : (result as any).toTextStreamResponse();
  } catch (error: any) {
    console.error('[AI Chatbot API Error]:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred processing your AI request.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
