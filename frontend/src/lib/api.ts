import { Customer, CustomerInput, CustomerListResponse, AuthResponse, User } from '../types/customer';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token && token !== 'null' && token !== 'undefined' && token !== 'Bearer null') {
      return token;
    }
    
    // Cookie fallback
    const match = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
    if (match) {
      const val = decodeURIComponent(match[1]);
      if (val && val !== 'null' && val !== 'undefined') {
        return val;
      }
    }
  }
  return null;
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `access_token=${token}; path=/; max-age=86400; SameSite=Lax${secureFlag}`;
  }
}

export function removeAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `access_token=; path=/; max-age=0; SameSite=Lax${secureFlag}`;
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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API Error: ${response.statusText}`;
    try {
      const errData = await response.json();
      if (errData.detail) {
        errorMessage = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
      }
    } catch (e) {
      // Ignore JSON parse error
    }
    
    if (response.status === 401 && typeof window !== 'undefined') {
      removeAuthToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    throw new Error(errorMessage);
  }

  return response.json();
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

  async register(userData: { email: string; password: string; full_name: string }): Promise<User> {
    return request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async getCurrentUser(): Promise<User> {
    const user = await request<User>('/api/auth/me');
    setStoredUser(user);
    return user;
  },

  // Customer Management REST APIs
  async getCustomers(params: { search?: string; status?: string; page?: number; limit?: number } = {}): Promise<CustomerListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<CustomerListResponse>(`/api/customers${queryString}`);
  },

  async getCustomerById(id: number): Promise<Customer> {
    return request<Customer>(`/api/customers/${id}`);
  },

  async createCustomer(customer: CustomerInput): Promise<Customer> {
    return request<Customer>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },

  async updateCustomer(id: number, customer: Partial<CustomerInput>): Promise<Customer> {
    return request<Customer>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customer),
    });
  },

  async deleteCustomer(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/customers/${id}`, {
      method: 'DELETE',
    });
  },
};
