'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useAuth } from '@/hooks/useAuth';
import type { CreditTransactionRow, UserCreditsRow } from '@/lib/supabase';

type UserCreditsPayload = {
  success: boolean;
  credits: number;
  creditRow: UserCreditsRow;
  transactions: CreditTransactionRow[];
};

export function useUserCredits() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [creditRow, setCreditRow] = useState<UserCreditsRow | null>(null);
  const [transactions, setTransactions] = useState<CreditTransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setCreditRow(null);
      setTransactions([]);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authedFetch('/api/user-credits/me');
      const payload = (await response.json()) as Partial<UserCreditsPayload> & { error?: string };

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load user credits');
      }

      setCredits(payload.credits ?? 0);
      setCreditRow((payload.creditRow as UserCreditsRow) ?? null);
      setTransactions((payload.transactions as CreditTransactionRow[]) ?? []);
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load user credits';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    credits,
    creditRow,
    transactions,
    isLoading,
    error,
    refresh,
  };
}
