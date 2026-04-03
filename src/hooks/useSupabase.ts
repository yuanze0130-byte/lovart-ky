import { useSession } from '@clerk/nextjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, useMemo, useRef } from 'react';
import { Database } from '@/lib/supabase';

/**
 * Custom hook to create a Supabase client with Clerk authentication
 * This automatically handles session tokens and authentication
 * 优化: 使用 useMemo 缓存客户端，避免频繁重建
 */
export function useSupabase() {
  const { session } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const tokenFetchedRef = useRef(false);

  // 获取 token（只在 session 变化时）
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('Missing Supabase environment variables');
      setToken(null);
      setIsReady(true);
      return;
    }

    if (!session) {
      setToken(null);
      setIsReady(true);
      tokenFetchedRef.current = false;
      return;
    }

    // 避免重复获取 token
    if (tokenFetchedRef.current) {
      return;
    }

    tokenFetchedRef.current = true;
    setIsReady(false);

    // 获取 token
    session.getToken({ template: 'supabase' }).then((newToken) => {
      if (!newToken) {
        console.error('Failed to get Supabase token from Clerk');
        setToken(null);
      } else {
        setToken(newToken);
      }
      setIsReady(true);
    }).catch((error) => {
      console.error('Error getting Supabase token:', error);
      setToken(null);
      setIsReady(true);
    });
  }, [session]);

  // 使用 useMemo 缓存 Supabase 客户端，只在 token 变化时重建
  const supabaseClient = useMemo(() => {
    if (!token || !isReady) {
      return null;
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return null;
    }

    // 创建 Supabase 客户端（只在 token 变化时）
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

    return client;
  }, [token, isReady]);

  return supabaseClient;
}
