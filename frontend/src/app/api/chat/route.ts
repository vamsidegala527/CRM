import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

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

    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!groqKey && !geminiKey) {
      return new Response(
        JSON.stringify({
          error: 'No AI API key configured. Please set GROQ_API_KEY (from https://console.groq.com) or GEMINI_API_KEY in your environment variables.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Select provider: Groq takes priority for high speed and generous free limits, falling back to Gemini
    let modelInstance: any;
    if (groqKey) {
      const groq = createGroq({ apiKey: groqKey });
      // openai/gpt-oss-120b has high OTPM limits on Groq; customizable via GROQ_MODEL
      const groqModelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
      modelInstance = groq(groqModelName);
    } else {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      modelInstance = google('gemini-3.6-flash');
    }

    const backendBase = (
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000'
    ).replace(/\/+$/, '');

    const fetchBackend = async (endpoint: string, options: RequestInit = {}) => {
      const url = `${backendBase}${endpoint}`;
      try {
        const res = await fetch(url, {
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
      } catch (err: any) {
        console.error(`[fetchBackend error on ${url}]:`, err);
        throw err;
      }
    };

    const getCustomersSchema = z.object({
      search: z.string().optional().describe('Search keyword matching name, email, company, or phone'),
      status: z.string().optional().describe('Filter by status: Active, Lead, Prospect, or Inactive'),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
    });

    const getCustomerSchema = z.object({
      customerId: z.number().describe('ID of the customer to retrieve'),
    });

    const createCustomerSchema = z.object({
      name: z.string().describe('Full name of the customer'),
      email: z.string().describe('Customer email address'),
      phone: z.string().optional().describe('Phone number'),
      company: z.string().optional().describe('Company name'),
      status: z.enum(['Active', 'Lead', 'Prospect', 'Inactive']).optional().default('Active'),
      address: z.string().optional().describe('Physical address'),
      notes: z.string().optional().describe('Internal notes or observations'),
    });

    const updateCustomerSchema = z.object({
      customerId: z.number().describe('ID of the customer to update'),
      name: z.string().optional().describe('New name'),
      email: z.string().optional().describe('New email address'),
      phone: z.string().optional().describe('New phone number'),
      company: z.string().optional().describe('New company name'),
      status: z.enum(['Active', 'Lead', 'Prospect', 'Inactive']).optional().describe('New status'),
      address: z.string().optional().describe('New address'),
      notes: z.string().optional().describe('New notes'),
    });

    const deleteCustomerSchema = z.object({
      customerId: z.number().describe('ID of the customer to delete'),
      customerName: z.string().describe('Name of the customer'),
      confirmed: z.boolean().describe('Set to true only if the user explicitly confirmed deletion'),
    });

    const maxOutputTokens = process.env.AI_MAX_OUTPUT_TOKENS ? Number(process.env.AI_MAX_OUTPUT_TOKENS) : 600;

    const result = streamText({
      model: modelInstance,
      maxOutputTokens,
      system: `You are an intelligent, friendly Customer Management AI Assistant embedded in the Customer Hub application.
You have direct tool access to live customer data. Help users manage their customer relationships effectively and safely.

CAPABILITIES:
- View, list, search, filter, and count customers
- View specific customer details
- Create new customer records
- Update existing customer details
- Delete customer records (with confirmation safety)
- Provide summaries, insights, and answers about customer statistics

RULES:
1. ALWAYS use tools when the user asks about their customers or asks you to perform actions. Do not make up fake data.
2. When creating customers:
   - "name" and "email" are REQUIRED.
   - If user didn't provide name or email, ask for them politely instead of guessing.
   - Default status is "Active".
3. When updating customers:
   - Ask for customer ID or search by name first if the ID is not provided.
4. When listing customers:
   - Provide a clear, clean markdown summary with names, companies, and statuses.
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
          inputSchema: getCustomersSchema,
          parameters: getCustomersSchema,
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
          inputSchema: getCustomerSchema,
          parameters: getCustomerSchema,
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
          inputSchema: createCustomerSchema,
          parameters: createCustomerSchema,
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
          inputSchema: updateCustomerSchema,
          parameters: updateCustomerSchema,
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
          inputSchema: deleteCustomerSchema,
          parameters: deleteCustomerSchema,
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
      console.error('[formatStreamError caught]:', error);
      const msg = error?.message || String(error || '');
      if (
        msg.includes('API key') ||
        msg.includes('API_KEY') ||
        msg.includes('unregistered callers') ||
        msg.includes('consumer identity') ||
        msg.includes('invalid_api_key')
      ) {
        return 'AI API key is missing or invalid. Please check your GROQ_API_KEY or GEMINI_API_KEY environment variable.';
      }
      if (
        msg.includes('quota') ||
        msg.includes('Quota') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rate-limits') ||
        msg.includes('rate_limit_exceeded') ||
        msg.includes('output tokens per minute') ||
        msg.includes('OTPM') ||
        msg.includes('Request too large')
      ) {
        return 'AI rate limit reached. Please wait a brief moment before sending another message.';
      }
      if (msg.includes('Unauthorized') || msg.includes('token') || msg.includes('Not authenticated')) {
        return 'Authentication token missing or expired. Please sign in again.';
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('fetchBackend error') || msg.includes('Failed to fetch')) {
        return 'The AI assistant was unable to communicate with the backend database. Please verify the backend service is running.';
      }
      return `AI assistant error: ${msg || 'Please try again.'}`;
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
