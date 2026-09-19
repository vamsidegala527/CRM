import {
  AuthResponse, User,
  EmployeeCreateInput, EmployeeUpdateInput, EmployeeSelfUpdateInput,
  ChangePasswordInput, EmployeeSetupInput, EmployeeMetrics, EmployeeSetupLinkResponse
} from '../types/employee';

export function getApiBaseUrl(): string {
  // In the browser on a deployed host (Render, Vercel, or custom domain):
  // Return '/api/proxy' so browser requests are made to the frontend domain (same-origin),
  // completely avoiding CORS issues and ensuring HttpOnly cookies work reliably across all browsers.
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return '/api/proxy';
    }
  }

  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  // If explicitly configured with a remote URL (not localhost or loopback) in server-side context
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/+$/, '');
  }
  // Local development fallback
  return (envUrl || 'http://localhost:8000').replace(/\/+$/, '');
}

// In-memory token for ephemeral headers when available (token is securely stored in HttpOnly cookie)
let inMemoryToken: string | null = null;

// Wipe any legacy unsecure token from localStorage
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('access_token');
  } catch (e) {}
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setAuthToken(token: string): void {
  inMemoryToken = token;
}

export function removeAuthToken(): void {
  inMemoryToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
    } catch (e) {}
  }
}

export function getStoredUser(): User | null {
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem('user_info');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

export function setStoredUser(user: User): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_info', JSON.stringify(user));
  }
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 30000,
  retries?: number
): Promise<T> {
  const token = getAuthToken();
  const isSafeMethod = !options.method || options.method.toUpperCase() === 'GET' || options.method.toUpperCase() === 'HEAD';
  const maxRetries = retries !== undefined ? retries : (isSafeMethod ? 2 : 0);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const baseUrl = getApiBaseUrl();
  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        credentials: 'include', // Ensures browser automatically sends and receives secure HttpOnly cookies
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If backend is waking up (502 Bad Gateway or 504 Gateway Timeout), retry safe requests
      if ([502, 503, 504].includes(response.status) && attempt <= maxRetries) {
        await wait(1500 * attempt);
        continue;
      }

      if (!response.ok) {
        let errorMessage = `API Error (${response.status}): ${response.statusText || 'Request failed'}`;
        if ([502, 503, 504].includes(response.status)) {
          errorMessage = `Backend service is waking up or temporarily unreachable (${response.status}). Please wait a few moments and try again.`;
        }
        try {
          const errText = await response.text();
          try {
            const errData = JSON.parse(errText);
            if (errData && errData.detail) {
              if (Array.isArray(errData.detail)) {
                errorMessage = errData.detail
                  .map((item: any) => {
                    const msg = item.msg || JSON.stringify(item);
                    return msg.replace(/^Value error,\s*/i, '');
                  })
                  .join('. ');
              } else if (typeof errData.detail === 'string') {
                errorMessage = errData.detail;
              } else {
                errorMessage = JSON.stringify(errData.detail);
              }
            } else if (errData && errData.message) {
              errorMessage = errData.message;
            }
          } catch {
            if (errText && errText.trim().length > 0 && !errText.includes('<!DOCTYPE') && !errText.includes('<html')) {
              errorMessage = errText.trim();
            }
          }
        } catch (e) {
          // Ignore read error
        }

        
        if (response.status === 401 && typeof window !== 'undefined') {
          removeAuthToken();
          const currentPath = window.location.pathname;
          const isPublicAuthPage = ['/login', '/register', '/verify-email', '/reset-password', '/forgot-password']
            .some((p) => currentPath.startsWith(p));
          if (!isPublicAuthPage) {
            window.location.href = '/login';
          }
        }

        const apiError: any = new Error(errorMessage);
        apiError.status = response.status;
        throw apiError;
      }

      const rawText = await response.text();
      try {
        return JSON.parse(rawText);
      } catch {
        return { message: rawText } as unknown as T;
      }

    } catch (netErr: any) {
      clearTimeout(timeoutId);
      lastError = netErr;

      const isAbort = netErr.name === 'AbortError';
      const isNetwork = netErr.name === 'TypeError' || (netErr.message && netErr.message.includes('Failed to fetch'));

      // If network or timeout during cold start and attempts remain, back off and retry
      if ((isAbort || isNetwork) && attempt <= maxRetries) {
        await wait(1500 * attempt);
        continue;
      }

      if (isAbort) {
        throw new Error(`Connection timed out after ${timeoutMs / 1000}s. The server may be cold-starting; please retry.`);
      }

      if (isNetwork) {
        const displayHost = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'backend');
        throw new Error(`Unable to reach the server at ${displayHost}. The backend may be cold-starting. Please wait a moment and retry.`);
      }

      throw netErr;
    }
  }

  throw lastError || new Error('Request failed after retries.');
}

export const api = {
  // Auth APIs
  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setAuthToken(res.access_token);
    setStoredUser(res.user);
    return res;
  },

  async googleAuth(idToken: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
    setAuthToken(res.access_token);
    setStoredUser(res.user);
    return res;
  },

  async register(userData: { email: string; password: string; full_name: string }): Promise<any> {
    return request<any>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async verifyEmail(codeOrToken: string): Promise<{ message: string; is_verified: boolean; email?: string }> {
    return request<{ message: string; is_verified: boolean; email?: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code: codeOrToken, token: codeOrToken }),
    });
  },

  async resendVerification(email: string): Promise<{ message: string; verification_token?: string }> {
    return request<{ message: string; verification_token?: string }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async forgotPassword(email: string): Promise<{ message: string; reset_token?: string }> {
    return request<{ message: string; reset_token?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string, confirmPassword?: string): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token,
        new_password: newPassword,
        confirm_password: confirmPassword || newPassword,
      }),
    });
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Clear client state even if network fails
    }
    removeAuthToken();
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      window.location.href = '/login';
    }
  },

  async getCurrentUser(): Promise<User> {
    const user = await request<User>('/api/auth/me');
    setStoredUser(user);
    return user;
  },

  // Employee Setup & Password Management APIs
  async setupEmployeeAccount(payload: EmployeeSetupInput): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/setup-employee', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async changePassword(payload: ChangePasswordInput): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Employee Management REST APIs (Admin & Self-Service)
  async getEmployeeMetrics(): Promise<EmployeeMetrics> {
    return request<EmployeeMetrics>('/api/employees/metrics');
  },

  async getEmployees(params: {
    search?: string;
    status?: string;
    account_status?: string;
    setup_status?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<User[]> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status && params.status !== 'All') query.append('status', params.status);
    if (params.account_status && params.account_status !== 'All') query.append('account_status', params.account_status);
    if (params.setup_status && params.setup_status !== 'All') query.append('setup_status', params.setup_status);
    if (params.skip !== undefined) query.append('skip', params.skip.toString());
    if (params.limit !== undefined) query.append('limit', params.limit.toString());

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<User[]>(`/api/employees${queryString}`);
  },

  async getEmployeeById(id: number | string): Promise<User> {
    return request<User>(`/api/employees/${id}`);
  },

  async createEmployee(payload: EmployeeCreateInput): Promise<User> {
    return request<User>('/api/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateEmployee(id: number | string, payload: EmployeeUpdateInput | EmployeeSelfUpdateInput): Promise<User> {
    return request<User>(`/api/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async reactivateEmployee(id: number | string): Promise<User> {
    return request<User>(`/api/employees/${id}/reactivate`, {
      method: 'POST',
    });
  },

  async deactivateEmployee(id: number | string, permanent: boolean = false, confirmed: boolean = false): Promise<{ message: string }> {
    const queryParams = new URLSearchParams();
    if (permanent) queryParams.append('permanent', 'true');
    if (confirmed) queryParams.append('confirmed', 'true');
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return request<{ message: string }>(`/api/employees/${id}${queryString}`, {
      method: 'DELETE',
    });
  },

  async sendEmployeeLoginEmail(id: number | string): Promise<EmployeeSetupLinkResponse> {
    return request<EmployeeSetupLinkResponse>(`/api/employees/${id}/send-login-email`, {
      method: 'POST',
    });
  },

  async getEmployeeSetupLink(id: number | string): Promise<EmployeeSetupLinkResponse> {
    return request<EmployeeSetupLinkResponse>(`/api/employees/${id}/setup-link`);
  },

  // Company Details APIs
  async getCompanyDetails(): Promise<any> {
    return request<any>('/api/company');
  },

  async updateCompanyDetails(payload: Record<string, any>): Promise<any> {
    return request<any>('/api/company', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};
