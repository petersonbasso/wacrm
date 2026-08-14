import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

// Mock Supabase admin client
const mockCreateUser = vi.fn();
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: {
      admin: {
        createUser: mockCreateUser,
      },
    },
  })),
}));

describe('POST /api/auth/register-invite', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
  });

  it('rejects request without valid JSON body', async () => {
    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      body: 'invalid-json',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('rejects request with missing token', async () => {
    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing invitation token');
  });

  it('rejects invalid email format', async () => {
    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'sample-token',
        email: 'invalid-email',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Please enter a valid email address');
  });

  it('rejects password shorter than 8 characters', async () => {
    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'sample-token',
        email: 'user@example.com',
        password: 'short',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('at least 8 characters');
  });

  it('rejects when invitation is not found in database', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'Not found' },
    });

    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'sample-token',
        email: 'user@example.com',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invitation not found or invalid');
  });

  it('rejects already accepted invitation', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'inv-1',
        account_id: 'acct-1',
        role: 'agent',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: new Date().toISOString(),
      },
      error: null,
    });

    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'sample-token',
        email: 'user@example.com',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('This invitation has already been used');
  });

  it('rejects expired invitation', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'inv-1',
        account_id: 'acct-1',
        role: 'agent',
        expires_at: new Date(Date.now() - 86400000).toISOString(),
        accepted_at: null,
      },
      error: null,
    });

    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'sample-token',
        email: 'user@example.com',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('This invitation has expired');
  });

  it('successfully creates user and returns ok: true when invitation is valid', async () => {
    // 1. Inv lookup
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'inv-1',
        account_id: 'acct-target',
        role: 'agent',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: null,
      },
      error: null,
    });

    // 2. Auth create user
    mockCreateUser.mockResolvedValueOnce({
      data: { user: { id: 'user-new-1', email: 'user@example.com' } },
      error: null,
    });

    // 3. Profile lookup for temp account
    mockSingle.mockResolvedValueOnce({
      data: { account_id: 'temp-acct-1' },
      error: null,
    });

    const req = new Request('http://localhost/api/auth/register-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'sample-token',
        email: 'user@example.com',
        password: 'password123',
        fullName: 'Test Agent',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      email: 'user@example.com',
      accountId: 'acct-target',
    });

    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Test Agent',
      },
    });
  });
});
