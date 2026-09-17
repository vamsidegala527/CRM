import { Customer, CustomerInput, CustomerListResponse, AuthResponse, User } from '../types/customer';

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
  timeoutMs: number = 18000,
  retries: number = 2
): Promise<T> {
  const token = getAuthToken();
  
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

  while (attempt <= retries) {
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

      // If backend is waking up (502 Bad Gateway or 504 Gateway Timeout), retry
      if ([502, 503, 504].includes(response.status) && attempt <= retries) {
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
      if ((isAbort || isNetwork) && attempt <= retries) {
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

  // Customer Management REST APIs (supports both numeric ID and UUID public_id)
  async getCustomers(params: { search?: string; status?: string; page?: number; limit?: number } = {}): Promise<CustomerListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<CustomerListResponse>(`/api/customers${queryString}`);
  },

  async getCustomerById(id: number | string): Promise<Customer> {
    return request<Customer>(`/api/customers/${id}`);
  },

  async createCustomer(customer: CustomerInput): Promise<Customer> {
    return request<Customer>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },

  // Partial update using PATCH (REST compliant)
  async updateCustomer(id: number | string, customer: Partial<CustomerInput>): Promise<Customer> {
    return request<Customer>(`/api/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(customer),
    });
  },

  // Full resource replacement using PUT
  async replaceCustomer(id: number | string, customer: CustomerInput): Promise<Customer> {
    return request<Customer>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customer),
    });
  },

  async deleteCustomer(id: number | string): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/customers/${id}`, {
      method: 'DELETE',
    });
  },
};
