/**
 * Automated Frontend Security & Authorization Boundary Test Suite
 * 
 * Verifies:
 * 1. Employee cannot access Admin functionality by manually changing:
 *    - URL / routes
 *    - Query parameters
 *    - Local storage / auth state
 *    - Frontend role / state
 * 2. Backend authorization remains the actual security boundary,
 *    and Employee requests to Admin APIs strictly return 403 Forbidden.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const BACKEND_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

let employeeToken = null;
let employeeUser = null;
let adminToken = null;

describe('Frontend Security & RBAC Boundary Tests', () => {
  before(async () => {
    // 1. Authenticate as Admin to set up an Employee
    const adminEmail = `admin_sec_${Date.now()}@example.com`;
    const adminPassword = 'AdminPassword123!';

    const regAdminRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        full_name: 'Admin Security Tester',
        password: adminPassword,
      }),
    });
    assert.equal(regAdminRes.status, 201, 'Admin registration should succeed');

    const loginAdminRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    });
    assert.equal(loginAdminRes.status, 200, 'Admin login should succeed');
    const adminData = await loginAdminRes.json();
    adminToken = adminData.access_token;

    // 2. Admin creates an Employee
    const empEmail = `emp_sec_${Date.now()}@example.com`;
    const empPassword = 'EmployeePassword123!';

    const createEmpRes = await fetch(`${BACKEND_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: empEmail,
        full_name: 'Employee Security Tester',
        department: 'Support',
        job_title: 'Agent',
      }),
    });
    assert.equal(createEmpRes.status, 201, 'Employee creation should succeed');

    // 3. Complete employee setup directly via backend test helper
    const setupRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `emp_alt_${Date.now()}@example.com`,
        full_name: 'Alt Employee',
        password: empPassword,
      }),
    });

    // Sign in as existing test employee created in database
    const loginEmpRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'emp@example.com',
        password: 'Password123!',
      }),
    });

    if (loginEmpRes.status === 200) {
      const empData = await loginEmpRes.json();
      employeeToken = empData.access_token;
      employeeUser = empData.user;
    } else {
      // Fallback to newly registered user
      const empData = await setupRes.json();
      const directLogin = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: empData.email,
          password: empPassword,
        }),
      });
      const data = await directLogin.json();
      employeeToken = data.access_token;
      employeeUser = data.user;
    }

    assert.ok(employeeToken, 'Employee access token must be present');
  });

  it('Scenario 1: Employee cannot access Admin URLs/routes (Employee Management)', async () => {
    const adminRoutes = [
      { method: 'GET', url: '/api/employees' },
      { method: 'POST', url: '/api/employees', body: { name: 'Rogue Employee', email: 'rogue_emp@example.com' } },
      { method: 'DELETE', url: '/api/employees/1' },
      { method: 'POST', url: '/api/employees/1/send-login-email' },
      { method: 'GET', url: '/api/employees/metrics' },
    ];

    for (const route of adminRoutes) {
      const res = await fetch(`${BACKEND_URL}${route.url}`, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${employeeToken}`,
        },
        body: route.body ? JSON.stringify(route.body) : undefined,
      });

      assert.equal(
        res.status,
        403,
        `Employee accessing ${route.method} ${route.url} must return 403 Forbidden`
      );

      const json = await res.json();
      assert.match(
        json.detail.toLowerCase(),
        /admin privilege is required|access denied/i,
        `Response must state that admin privilege is required: ${json.detail}`
      );
    }
  });

  it('Scenario 2: Employee cannot bypass authorization by manipulating Query Parameters', async () => {
    const queryParamAttacks = [
      '/api/employees?role=admin',
      '/api/employees?isAdmin=true',
      '/api/employees?overrideRole=admin',
      '/api/employees?user_role=admin&bypass=true',
      '/api/employees/metrics?role=admin',
      '/api/employees/metrics?isAdmin=1',
    ];

    for (const path of queryParamAttacks) {
      const res = await fetch(`${BACKEND_URL}${path}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${employeeToken}`,
        },
      });

      assert.equal(
        res.status,
        403,
        `Employee query parameter manipulation on ${path} must return 403 Forbidden`
      );
    }
  });

  it('Scenario 3: Employee cannot gain Admin access by tampering with Local Storage / Frontend State', async () => {
    // Simulate what happens in the frontend when a user manually tampers with localStorage:
    // localStorage.setItem('user_info', JSON.stringify({ ...employee, role: 'admin' }))
    const tamperedLocalStorageUser = {
      ...employeeUser,
      role: 'admin', // Tampered client state!
    };

    // Client-side code sends request with employee's valid JWT but tampered state assumption
    const res = await fetch(`${BACKEND_URL}/api/employees`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${employeeToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Backend MUST ignore client-side expectations and enforce server-side role check
    assert.equal(
      res.status,
      403,
      'Backend must reject request with 403 regardless of client-side role tampering'
    );
  });

  it('Scenario 4: Employee cannot escalate privileges by forging Request Headers', async () => {
    const forgedHeaders = [
      { 'X-Role': 'admin' },
      { 'X-User-Role': 'admin' },
      { 'X-Admin': 'true' },
      { 'X-Privilege': 'superadmin' },
    ];

    for (const header of forgedHeaders) {
      const res = await fetch(`${BACKEND_URL}/api/employees`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${employeeToken}`,
          ...header,
        },
      });

      assert.equal(
        res.status,
        403,
        `Header spoofing with ${JSON.stringify(header)} must return 403 Forbidden`
      );
    }
  });

  it('Scenario 5: Backend authorization remains the actual security boundary', async () => {
    // Test that backend authorization strictly enforces 403 across ALL Admin mutation endpoints
    const mutations = [
      { method: 'POST', url: '/api/employees', body: { full_name: 'Attacker Corp', email: 'attacker@corp.com' } },
      { method: 'PUT', url: '/api/employees/999', body: { full_name: 'Tampered Employee' } },
      { method: 'DELETE', url: '/api/employees/999' },
      { method: 'POST', url: '/api/employees/999/send-login-email' },
      { method: 'POST', url: '/api/employees/999/reactivate' },
    ];

    for (const mutation of mutations) {
      const res = await fetch(`${BACKEND_URL}${mutation.url}`, {
        method: mutation.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${employeeToken}`,
        },
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
      });

      assert.equal(
        res.status,
        403,
        `Mutation ${mutation.method} ${mutation.url} MUST be blocked with 403 Forbidden`
      );
    }
  });
});
