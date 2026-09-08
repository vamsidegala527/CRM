export type CustomerStatus = 'Active' | 'Lead' | 'Prospect' | 'Inactive';

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  status: CustomerStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  owner_id?: number | null;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  status?: CustomerStatus;
  notes?: string;
}

export interface CustomerListResponse {
  total: number;
  items: Customer[];
  page: number;
  limit: number;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}
