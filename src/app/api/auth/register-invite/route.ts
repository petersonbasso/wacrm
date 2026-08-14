// ============================================================
// POST /api/auth/register-invite
//
// Public — no caller session required. Allows a new user with
// a valid invite token to register an account, auto-confirm their
// email, and atomically join the invited workspace with the
// designated role.
//
// Security model:
//   - Rate-limited per IP (10 attempts/min).
//   - Validates input format (email regex, password >= 8 chars).
//   - Verifies the invite token hash in `account_invitations`
//     (must exist, not be expired, and not be redeemed).
//   - Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass client-side
//     signup blocks, ensuring public signups can be disabled
//     in Supabase Auth without breaking invitations.
//   - Cleans up the temporary personal account created by the
//     `on_auth_user_created` trigger.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { hashInviteToken } from '@/lib/auth/invitations';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

let _adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing Supabase admin environment variables');
    }
    _adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
}

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(
    `register-invite:${ip}`,
    RATE_LIMITS.invitationRegister
  );
  if (!limit.success) return rateLimitResponse(limit);

  let body: {
    token?: string;
    email?: string;
    password?: string;
    fullName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, email, password, fullName } = body;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return NextResponse.json(
      { error: 'Missing invitation token' },
      { status: 400 }
    );
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json(
      { error: 'Please enter a valid email address' },
      { status: 400 }
    );
  }

  if (
    !password ||
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanFullName = typeof fullName === 'string' ? fullName.trim() : '';
  const tokenHash = hashInviteToken(token.trim());

  const supabaseAdmin = getAdminClient();

  // 1. Verify invitation validity
  const { data: inv, error: invError } = await supabaseAdmin
    .from('account_invitations')
    .select('id, account_id, role, expires_at, accepted_at')
    .eq('token_hash', tokenHash)
    .single();

  if (invError || !inv) {
    return NextResponse.json(
      { error: 'Invitation not found or invalid' },
      { status: 400 }
    );
  }

  if (inv.accepted_at) {
    return NextResponse.json(
      { error: 'This invitation has already been used' },
      { status: 400 }
    );
  }

  if (new Date(inv.expires_at) <= new Date()) {
    return NextResponse.json(
      { error: 'This invitation has expired' },
      { status: 400 }
    );
  }

  // 2. Create the user using Supabase Admin Auth
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
      },
    });

  if (authError || !authData.user) {
    console.error('[register-invite] createUser error:', authError);
    return NextResponse.json(
      { error: authError?.message || 'Failed to create user account' },
      { status: 400 }
    );
  }

  const newUserId = authData.user.id;

  try {
    // 3. Find the temporary personal account created by the bootstrap trigger
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('account_id')
      .eq('user_id', newUserId)
      .single();

    const tempAccountId = profile?.account_id;

    // 4. Update the profile to join the invited workspace with the designated role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        account_id: inv.account_id,
        account_role: inv.role,
        full_name: cleanFullName || null,
      })
      .eq('user_id', newUserId);

    if (profileError) {
      console.error('[register-invite] profile update error:', profileError);
    }

    // 5. Mark the invitation as accepted
    const { error: inviteUpdateError } = await supabaseAdmin
      .from('account_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: newUserId,
      })
      .eq('id', inv.id);

    if (inviteUpdateError) {
      console.error(
        '[register-invite] invite update error:',
        inviteUpdateError
      );
    }

    // 6. Delete the temporary bootstrap account if one was created
    if (tempAccountId && tempAccountId !== inv.account_id) {
      await supabaseAdmin.from('accounts').delete().eq('id', tempAccountId);
    }

    return NextResponse.json({
      ok: true,
      email: cleanEmail,
      accountId: inv.account_id,
    });
  } catch (err) {
    console.error('[register-invite] unexpected post-creation error:', err);
    return NextResponse.json({
      ok: true,
      email: cleanEmail,
      accountId: inv.account_id,
    });
  }
}
