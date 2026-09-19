export type AccountStatusFilter = 'All' | 'Active' | 'Inactive';
export type SetupStatusFilter = 'All' | 'Pending' | 'Completed';

export interface User {
  id: number;
  public_id?: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified?: boolean;
  first_login?: boolean;
  login_count?: number;
  role: 'admin' | 'employee';
  is_setup_complete?: boolean;
  phone?: string | null;
  department?: string | null;
  job_title?: string | null;
  company?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: string;
  setup_url?: string | null;
  invitation_code?: string | null;
}

export interface EmployeeSetupLinkResponse {
  message?: string;
  setup_url?: string;
  invitation_code?: string;
  is_setup_complete?: boolean;
  email_delivered?: boolean;
  email_error?: string;
}

export interface EmployeeCreateInput {
  email: string;
  full_name: string;
  department?: string;
  job_title?: string;
  company?: string;
  address?: string;
  notes?: string;
  phone?: string;
}

export interface EmployeeUpdateInput {
  full_name?: string;
  department?: string;
  job_title?: string;
  company?: string;
  address?: string;
  notes?: string;
  phone?: string;
  is_active?: boolean;
}

export interface EmployeeSelfUpdateInput {
  full_name?: string;
  department?: string;
  phone?: string;
  address?: string;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
  confirm_password?: string;
}

export interface EmployeeSetupInput {
  token: string;
  email: string;
  new_password: string;
  confirm_password?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface EmployeeMetrics {
  total_employees: number;
  active_staff: number;
  inactive_staff: number;
  setup_pending: number;
  setup_completed: number;
}
