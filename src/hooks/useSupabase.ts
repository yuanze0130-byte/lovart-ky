'use client';

import { createClient } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { Database } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function useSupabase() {
  const { session } = useAuth();

  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const supabaseClient = useMemo(() => {
    if (!hasSupabaseEnv) {
      return null;
    }

    return createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: session?.access_token
            ? {
                Authorization: `Bearer ${session.access_token}`,
              }
            : {},
        },
        auth: {
          persistSession: false,
        },
      }
    );
  }, [hasSupabaseEnv, session?.access_token]);

  return supabaseClient;
}
