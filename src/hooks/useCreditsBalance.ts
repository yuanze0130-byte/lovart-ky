'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabase } from '@/hooks/useSupabase';
import { CREDITS_BALANCE_UPDATED_EVENT } from '@/lib/credits-balance-events';
import type { UserCreditsRow } from '@/lib/supabase';

export function useCreditsBalance() {
  const { user } = useUser();
  const supabase = useSupabase();
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);

  const refreshCredits = useCallback(async () => {
    if (!user || !supabase) {
      setCredits(null);
      setIsLoadingCredits(false);
      return null;
    }

    setIsLoadingCredits(true);

    try {
      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const creditRow = data as UserCreditsRow | null;

      if (error && error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabase
          .from('user_credits')
          .insert({ user_id: user.id, credits: 1000 })
          .select()
          .single();

        if (insertError) throw insertError;
        const insertedCredits = newData as UserCreditsRow | null;
        const nextCredits = insertedCredits?.credits ?? 1000;
        setCredits(nextCredits);
        return nextCredits;
      }

      if (error) throw error;

      const nextCredits = creditRow?.credits ?? 1000;
      setCredits(nextCredits);
      return nextCredits;
    } catch (error) {
      console.error('Failed to load user credits:', error);
      setCredits(1000);
      return 1000;
    } finally {
      setIsLoadingCredits(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  useEffect(() => {
    const handleCreditsUpdated = () => {
      void refreshCredits();
    };

    window.addEventListener(CREDITS_BALANCE_UPDATED_EVENT, handleCreditsUpdated);
    return () => {
      window.removeEventListener(CREDITS_BALANCE_UPDATED_EVENT, handleCreditsUpdated);
    };
  }, [refreshCredits]);

  return {
    credits,
    setCredits,
    isLoadingCredits,
    refreshCredits,
  };
}
