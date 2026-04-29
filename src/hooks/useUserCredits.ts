'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useAuth } from '@/hooks/useAuth';
import type { CreditTransactionRow, UserCreditsRow, Database } from '@/lib/supabase';

type RedeemCodeRedemptionRow = Database['public']['Tables']['redeem_code_redemptions']['Row'];

type UserCreditsPayload = {
  success: boolean;
  credits: number;
  creditRow: UserCreditsRow;
  transactions: CreditTransactionRow[];
  redemptions: RedeemCodeRedemptionRow[];
};

export function useUserCredits() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [creditRow, setCreditRow] = useState<UserCreditsRow | null>(null);
  const [transactions, setTransactions] = useState<CreditTransactionRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedeemCodeRedemptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setCreditRow(null);
      setTransactions([]);
      setRedemptions([]);
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
      setRedemptions((payload.redemptions as RedeemCodeRedemptionRow[]) ?? []);
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

  const redeemCode = useCallback(async (code: string) => {
    setIsRedeeming(true);
    setError(null);

    try {
      const response = await authedFetch('/api/user-credits/redeem-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || '卡密兑换失败');
      }

      await refresh();
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : '卡密兑换失败';
      setError(message);
      throw error;
    } finally {
      setIsRedeeming(false);
    }
  }, [refresh]);

  return {
    credits,
    creditRow,
    transactions,
    redemptions,
    isLoading,
    isRedeeming,
    error,
    refresh,
    redeemCode,
  };
}
