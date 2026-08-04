'use client';

import { useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export function useSupabase() {
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const supabaseClient = useMemo(() => {
    if (!hasSupabaseEnv) {
      return null;
    }

    return createSupabaseBrowserClient();
  }, [hasSupabaseEnv]);

  return supabaseClient;
}
