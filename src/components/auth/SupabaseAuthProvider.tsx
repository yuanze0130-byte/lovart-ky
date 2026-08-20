'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  sendEmailLogin: (email: string, captchaToken?: string, useEmailOtp?: boolean) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return null;
    }
    return createSupabaseBrowserClient();
  });
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));

  useEffect(() => {
    let mounted = true;
    let authEventVersion = 0;

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventVersion += 1;
      if (!mounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    const restoreSession = async () => {
      const restoreVersion = authEventVersion;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted || authEventVersion !== restoreVersion) return;

        if (!error) {
          setSession(data.session ?? null);
          setUser(data.session?.user ?? null);
          setLoading(false);
          return;
        }

        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        }
      }

      if (!mounted || authEventVersion !== restoreVersion) return;
      console.warn('Supabase session restore failed:', lastError?.message || 'unknown error');
      setLoading(false);
    };

    void restoreSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      sendEmailLogin: async (email: string, captchaToken?: string, useEmailOtp = false) => {
        if (!supabase) throw new Error('Supabase Auth 环境变量未配置');
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/lovart` : undefined;
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            captchaToken,
            emailRedirectTo: useEmailOtp ? undefined : redirectTo,
          },
        });
        if (error) throw error;
      },
      verifyEmailOtp: async (email: string, token: string) => {
        if (!supabase) throw new Error('Supabase Auth 环境变量未配置');
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'email',
        });
        if (error) throw error;
      },
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      },
    }),
    [loading, session, supabase, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider');
  }
  return context;
}
