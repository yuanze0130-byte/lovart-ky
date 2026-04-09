import { createServerSupabaseClient } from '@/lib/supabase';
import type { NextRequest } from 'next/server';

export async function requireUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const token = authHeader.slice(7);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error('NOT_AUTHENTICATED');
  }

  return data.user;
}
