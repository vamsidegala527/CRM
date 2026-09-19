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
      return new Response(JSON.stringify({ error: 'Please log in to access the HR Assistant.' }), {
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

    // 1. Fetch current authenticated user to enforce strict RBAC
    let currentUser: any = null;
    try {
      currentUser = await fetchBackend('/api/auth/me');
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized session or authentication token expired. Please sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userRole = (currentUser?.role || 'employee').toLowerCase();
    const isEmployee = userRole === 'employee';
    const userName = currentUser?.full_name || 'User';

    // -------------------------------------------------------------
    // Schemas
    // -------------------------------------------------------------
    // Employee Self-Service Schema
    const updateMyProfileSchema = z.object({
      full_name: z.string().optional().describe('Updated full name'),
      department: z.string().optional().describe('Updated department'),
      phone: z.string().optional().describe('Updated contact phone number'),
      address: z.string().optional().describe('Updated office or residential address'),
    });

    // Admin Schemas
    const getEmployeesSchema = z.object({
      search: z.string().optional().describe('Search keyword matching full name, email, department, job title, phone, company, or public ID'),
      account_status: z.enum(['All', 'Active', 'Inactive']).optional().describe('Filter by account status: All, Active, or Inactive'),
      setup_status: z.enum(['All', 'Pending', 'Completed']).optional().describe('Filter by setup status: All, Pending, or Completed'),
      skip: z.number().optional().default(0),
      limit: z.number().optional().default(20),
    });

    const getEmployeeSchema = z.object({
      employeeId: z.union([z.number(), z.string()]).describe('Numeric ID or public ID of the employee to retrieve'),
    });

    const createEmployeeSchema = z.object({
      full_name: z.string().describe('Full legal or preferred name of the employee'),
      email: z.string().describe('Corporate email address of the employee'),
      department: z.string().optional().describe('Department name (e.g. Engineering, Sales, HR, Marketing)'),
      job_title: z.string().optional().describe('Official job title or position'),
      company: z.string().optional().describe('Company or organization name'),
      address: z.string().optional().describe('Work location or physical address'),
      phone: z.string().optional().describe('Contact phone number'),
      notes: z.string().optional().describe('Internal HR administrative notes'),
    });

    const updateEmployeeSchema = z.object({
      employeeId: z.union([z.number(), z.string()]).describe('Numeric ID or public ID of the employee to update'),
      full_name: z.string().optional().describe('Updated full name'),
      department: z.string().optional().describe('Updated department'),
      job_title: z.string().optional().describe('Updated job title'),
      company: z.string().optional().describe('Updated company name'),
      address: z.string().optional().describe('Updated address'),
      phone: z.string().optional().describe('Updated phone number'),
      notes: z.string().optional().describe('Updated HR notes'),
      is_active: z.boolean().optional().describe('Active account status (true/false)'),
    });

    const deleteEmployeeSchema = z.object({
      employeeId: z.union([z.number(), z.string()]).describe('Numeric ID or public ID of the employee to delete or deactivate'),
      employeeName: z.string().describe('Name of the employee'),
      permanent: z.boolean().optional().default(false).describe('Set to true for permanent database deletion; false for soft deactivation (recommended)'),
      confirmed: z.boolean().describe('Set to true only if the user explicitly confirmed permanent deletion or deactivation'),
    });

    const reactivateEmployeeSchema = z.object({
      employeeId: z.union([z.number(), z.string()]).describe('Numeric ID or public ID of the employee to reactivate'),
      employeeName: z.string().describe('Name of the employee'),
    });

    // -------------------------------------------------------------
    // Tools Definition (Strictly Isolated by Role)
    // -------------------------------------------------------------
    const employeeTools: Record<string, any> = {
      getMyProfile: tool({
        description: 'Retrieve the current logged-in employee\'s own profile details (full name, email, department, job title, phone, address, account status, and join date).',
        inputSchema: z.object({}),
        parameters: z.object({}),
        execute: async () => {
          try {
            return await fetchBackend('/api/employees/me');
          } catch (err: any) {
            return { error: err.message || 'Failed to retrieve your profile.' };
          }
        },
      } as any),

      updateMyProfile: tool({
        description: 'Update the current logged-in employee\'s own contact details (full name, department, phone number, address).',
        inputSchema: updateMyProfileSchema,
        parameters: updateMyProfileSchema,
        execute: async (updateFields: any) => {
          try {
            const res = await fetchBackend('/api/employees/me', {
              method: 'PUT',
              body: JSON.stringify(updateFields),
            });
            return {
              success: true,
              message: 'Your profile has been updated successfully.',
              updated_profile: res,
            };
          } catch (err: any) {
            return { error: err.message || 'Failed to update your profile.' };
          }
        },
      } as any),
    };

    const adminTools: Record<string, any> = {
      getEmployees: tool({
        description: 'Fetch, search, filter, or count employees in the directory.',
        inputSchema: getEmployeesSchema,
        parameters: getEmployeesSchema,
        execute: async ({ search, account_status, setup_status, skip, limit }: any) => {
          try {
            const query = new URLSearchParams();
            if (search) query.append('search', search);
            if (account_status && account_status !== 'All') query.append('account_status', account_status);
            if (setup_status && setup_status !== 'All') query.append('setup_status', setup_status);
            query.append('skip', String(skip || 0));
            query.append('limit', String(limit || 20));
            return await fetchBackend(`/api/employees?${query.toString()}`);
          } catch (err: any) {
            return { error: err.message || 'Failed to retrieve employees.' };
          }
        },
      } as any),

      getEmployeeMetrics: tool({
        description: 'Retrieve real-time organizational KPIs: Total Employees, Active Staff, Inactive Staff, Setup Pending, Setup Completed.',
        inputSchema: z.object({}),
        parameters: z.object({}),
        execute: async () => {
          try {
            return await fetchBackend('/api/employees/metrics');
          } catch (err: any) {
            return { error: err.message || 'Failed to retrieve employee metrics.' };
          }
        },
      } as any),

      getEmployee: tool({
        description: 'Get a specific employee profile by numeric ID or public ID.',
        inputSchema: getEmployeeSchema,
        parameters: getEmployeeSchema,
        execute: async ({ employeeId }: any) => {
          try {
            return await fetchBackend(`/api/employees/${employeeId}`);
          } catch (err: any) {
            return { error: err.message || `Employee #${employeeId} not found.` };
          }
        },
      } as any),

      createEmployee: tool({
        description: 'Create a new employee record and trigger their account setup invitation.',
        inputSchema: createEmployeeSchema,
        parameters: createEmployeeSchema,
        execute: async (employeeData: any) => {
          try {
            return await fetchBackend('/api/employees', {
              method: 'POST',
              body: JSON.stringify(employeeData),
            });
          } catch (err: any) {
            return { error: err.message || 'Failed to create employee.' };
          }
        },
      } as any),

      updateEmployee: tool({
        description: 'Update an existing employee profile by ID.',
        inputSchema: updateEmployeeSchema,
        parameters: updateEmployeeSchema,
        execute: async ({ employeeId, ...updateFields }: any) => {
          try {
            return await fetchBackend(`/api/employees/${employeeId}`, {
              method: 'PUT',
              body: JSON.stringify(updateFields),
            });
          } catch (err: any) {
            return { error: err.message || `Failed to update employee #${employeeId}.` };
          }
        },
      } as any),

      deactivateEmployee: tool({
        description: 'Deactivate an employee (soft-delete), revoking their active sessions while keeping records intact.',
        inputSchema: z.object({
          employeeId: z.union([z.number(), z.string()]).describe('Employee ID or public ID'),
          employeeName: z.string().describe('Name of the employee'),
        }),
        parameters: z.object({
          employeeId: z.union([z.number(), z.string()]),
          employeeName: z.string(),
        }),
        execute: async ({ employeeId, employeeName }: any) => {
          try {
            const res = await fetchBackend(`/api/employees/${employeeId}?permanent=false`, {
              method: 'DELETE',
            });
            return {
              success: true,
              employeeId,
              employeeName,
              message: res.message || `Employee "${employeeName}" deactivated successfully.`,
            };
          } catch (err: any) {
            return { error: err.message || `Failed to deactivate employee #${employeeId}.` };
          }
        },
      } as any),

      reactivateEmployee: tool({
        description: 'Reactivate an inactive employee account so they can log in again.',
        inputSchema: reactivateEmployeeSchema,
        parameters: reactivateEmployeeSchema,
        execute: async ({ employeeId, employeeName }: any) => {
          try {
            const res = await fetchBackend(`/api/employees/${employeeId}/reactivate`, {
              method: 'POST',
            });
            return {
              success: true,
              employeeId,
              employeeName,
              message: `Employee "${employeeName}" reactivated successfully.`,
              employee: res,
            };
          } catch (err: any) {
            return { error: err.message || `Failed to reactivate employee #${employeeId}.` };
          }
        },
      } as any),

      deleteEmployee: tool({
        description: 'Permanently delete an employee record from the database. Requires explicit confirmation.',
        inputSchema: deleteEmployeeSchema,
        parameters: deleteEmployeeSchema,
        execute: async ({ employeeId, employeeName, permanent, confirmed }: any) => {
          if (permanent && !confirmed) {
            return {
              requiresConfirmation: true,
              employeeId,
              employeeName,
              permanent: true,
              message: `Are you sure you want to permanently delete employee "${employeeName}" (ID #${employeeId})? This action is irreversible and removes all employee data.`,
            };
          }
          try {
            const query = new URLSearchParams();
            if (permanent) {
              query.append('permanent', 'true');
              query.append('confirmed', 'true');
            }
            const res = await fetchBackend(`/api/employees/${employeeId}?${query.toString()}`, {
              method: 'DELETE',
            });
            return {
              success: true,
              employeeId,
              employeeName,
              permanent: Boolean(permanent),
              message: res.message || `Employee "${employeeName}" ${permanent ? 'permanently deleted' : 'deactivated'} successfully.`,
            };
          } catch (err: any) {
            return { error: err.message || `Failed to delete employee #${employeeId}.` };
          }
        },
      } as any),
    };

    // -------------------------------------------------------------
    // System Prompts (Tailored by Role)
    // -------------------------------------------------------------
    const employeeSystemPrompt = `You are Nexus AI, an intelligent, helpful, and courteous Employee Self-Service Assistant for ${userName} (Email: ${currentUser?.email || 'N/A'}).
You assist this specific employee in navigating their employee portal, checking and updating their personal profile details, and providing self-service guidance.

ROLE & STRICT ACCESS CONTROL:
- You are strictly operating under the "Employee" role for ${userName}.
- You can ONLY view or update the current employee's OWN profile via getMyProfile and updateMyProfile.
- You do NOT have access to company-wide employee rosters, other colleagues' personal records, administrative HR metrics, or management operations.
- STRICT PRIVACY & PERMISSION DENIAL: If the user asks to list employees, search other colleagues, view company metrics, add/create employees, deactivate accounts, or delete records, you MUST politely refuse and state:
  "As an Employee, you only have access to your personal self-service profile and details. Accessing other employee records or company-wide HR metrics requires HR/Admin privileges."

CAPABILITIES:
- View current employee's profile, contact details, department, job title, and onboarding status (getMyProfile)
- Update current employee's personal contact info: full name, department, phone number, and address (updateMyProfile)
- Provide step-by-step guidance on changing password via the Change Password card in the portal
- Answer questions about portal navigation and self-service features

CONVERSATION & RESPONSE GUIDELINES:
1. WARM & PROFESSIONAL TONE:
   - Greet ${userName} warmly and keep responses concise, clear, and well-structured.
   - Use clean markdown, bolding, and bullet points.
2. SMART PROFILE UPDATES:
   - When updating contact details, confirm the updated fields back to the user clearly.
3. CONTEXT-AWARE SMART SUGGESTIONS:
   - At the VERY END of your response, append 2 to 3 contextual follow-up suggestions on a new line in this EXACT format:
     [SUGGESTIONS: "View My Profile", "Update Contact Details", "Change Password Help"]`;

    const adminSystemPrompt = `You are Nexus AI, an intelligent, friendly, and proactive HR Assistant embedded in the HR & Employee Management Portal.
You have direct tool access to live employee directory data and administrative actions for authorized HR/Admin users (${userName}). Help administrators manage personnel rosters, onboarding statuses, and access permissions safely and effectively.

ROLE & ACCESS CONTROL RULES:
- Employee directory management (viewing, listing, creating, updating, deactivating, reactivating, and permanently deleting employees) is strictly restricted to HR/Admin accounts.
- There are only two user roles in this system: "HR/Admin" and "Employee".
- If any tool returns an "Access denied" or 403 error, inform the user that their current role does not have permission to perform employee management operations.

CAPABILITIES:
- View, list, search, filter, and count employees (HR/Admin only)
- View high-level organizational metrics via getEmployeeMetrics (Total Employees, Active Staff, Inactive Staff, Setup Pending, Setup Completed)
- View specific employee details (HR/Admin only)
- Create new employee records and dispatch invitation emails (HR/Admin only)
- Update existing employee profiles (HR/Admin only)
- Soft-deactivate or reactivate employee accounts (HR/Admin only)
- Permanently delete employee records with strict explicit confirmation safety (HR/Admin only)
- Provide summaries, organizational insights, and breakdown by department or status

CONVERSATION & RESPONSE GUIDELINES:
1. NATURAL & INTERACTIVE TONE:
   - Greet users warmly and keep answers clear, structured, and easy to scan.
   - Use bullet points, bold names, and status tags (e.g. **Active**, **Inactive**, **Setup Pending**, **Setup Complete**).
   - After completing an action, offer a relevant follow-up or next step.
2. SMART HANDLING OF INCOMPLETE OR UNCLEAR REQUESTS:
   - When creating employees: "full_name" and "email" are REQUIRED. If missing, politely ask for them.
   - When updating or deleting: If employee ID is unknown, search by name or email first.
3. PERMANENT DELETION SAFETY:
   - Permanent deletion is irreversible and requires confirmed=true.
   - Deactivation (soft-delete) is the recommended default.
   - If permanent deletion is requested and confirmed is false, ask the user to explicitly confirm before proceeding.
4. CONTEXT-AWARE SMART SUGGESTIONS:
   - At the VERY END of your response, append 2 to 4 contextual follow-up suggestions on a new line in this EXACT format:
     [SUGGESTIONS: "Option 1", "Option 2", "Option 3"]
5. DATA SECURITY & ACCURACY:
   - All backend API calls enforce authentication and RBAC data isolation. Never invent fake employee records.`;

    const maxOutputTokens = process.env.AI_MAX_OUTPUT_TOKENS ? Number(process.env.AI_MAX_OUTPUT_TOKENS) : 600;

    const result = streamText({
      model: modelInstance,
      maxOutputTokens,
      system: isEmployee ? employeeSystemPrompt : adminSystemPrompt,
      messages,
      stopWhen: stepCountIs(5),
      onError: (error: any) => {
        console.error('[streamText Execution Error]:', error);
      },
      tools: isEmployee ? employeeTools : adminTools,
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

export async function GET() {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const isAvailable = Boolean(groqKey || geminiKey);
  return Response.json({
    available: isAvailable,
    provider: groqKey ? 'groq' : geminiKey ? 'google' : null,
  });
}
