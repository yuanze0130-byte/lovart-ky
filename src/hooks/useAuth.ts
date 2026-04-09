'use client';

import { useSupabaseAuth } from '@/components/auth/SupabaseAuthProvider';

export function useAuth() {
  return useSupabaseAuth();
}
