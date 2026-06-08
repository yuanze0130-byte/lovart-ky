'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!hasSupabaseEnv) {
    throw new Error('Supabase Auth 环境变量未配置');
  }

  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });
}
