import { useSession } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { Database } from '@/lib/supabase';

/**
 * Custom hook to create a Supabase client with Clerk authentication.
 * Only builds the client once the Clerk session token is ready.
 */
export function useSupabase() {
  const { session } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadToken() {
      if (!hasSupabaseEnv) {
        console.error('Missing Supabase environment variables');
        if (!isCancelled) {
          setToken(null);
          setIsReady(true);
        }
        return;
      }

      if (!session) {
        if (!isCancelled) {
          setToken(null);
          setIsReady(true);
        }
        return;
      }

      if (!isCancelled) {
        setIsReady(false);
      }

      try {
        const newToken = await session.getToken({ template: 'supabase' });

        if (!isCancelled) {
          if (!newToken) {
            console.error('Failed to get Supabase token from Clerk');
            setToken(null);
          } else {
            setToken(newToken);
          }
          setIsReady(true);
        }
      } catch (error) {
        console.error('Error getting Supabase token:', error);
        if (!isCancelled) {
          setToken(null);
          setIsReady(true);
        }
      }
    }

    void loadToken();

    return () => {
      isCancelled = true;
    };
  }, [session, hasSupabaseEnv]);

  const supabaseClient = useMemo(() => {
    if (!token || !isReady || !hasSupabaseEnv) {
      return null;
    }

    return createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );
  }, [token, isReady, hasSupabaseEnv]);

  return supabaseClient;
}
