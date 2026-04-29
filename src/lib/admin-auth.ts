import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/require-user';

export type AdminTargetUser = {
  id: string;
  email?: string;
};

export function createAdminServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdminUser(request: NextRequest) {
  const currentUser = await requireUser(request);
  const adminEmails = getAdminEmails();
  const currentEmail = (currentUser.email || '').toLowerCase();

  if (!currentEmail || !adminEmails.includes(currentEmail)) {
    throw new Error('FORBIDDEN');
  }

  return currentUser;
}

export async function resolveTargetUser(identifier: string) {
  const supabase = createAdminServiceRoleClient();
  const trimmed = identifier.trim();

  if (!trimmed) {
    throw new Error('TARGET_IDENTIFIER_REQUIRED');
  }

  if (!trimmed.includes('@')) {
    const { data, error } = await supabase.auth.admin.getUserById(trimmed);
    if (error || !data.user) {
      throw new Error('TARGET_USER_NOT_FOUND');
    }

    return {
      id: data.user.id,
      email: data.user.email,
    } satisfies AdminTargetUser;
  }

  let page = 1;
  const email = trimmed.toLowerCase();

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }

    const matched = data.users.find((user) => (user.email || '').toLowerCase() === email);
    if (matched) {
      return {
        id: matched.id,
        email: matched.email,
      } satisfies AdminTargetUser;
    }

    if (!data.users.length || data.users.length < 200) {
      break;
    }

    page += 1;
  }

  throw new Error('TARGET_USER_NOT_FOUND');
}
