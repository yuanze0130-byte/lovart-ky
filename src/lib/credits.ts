import { auth } from '@clerk/nextjs/server';
import { createClerkSupabaseClient, type Json } from '@/lib/supabase';
import type { BillingAction, BillingQuote } from '@/lib/pricing';

export type CreditTransactionDirection = 'debit' | 'refund' | 'grant';
export type CreditTransactionStatus = 'success' | 'failed' | 'refunded';

export interface CreditTransactionMeta {
  requestPath?: string;
  provider?: string;
  quote?: BillingQuote;
  [key: string]: unknown;
}

function toJsonValue(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === 'object') {
    const result: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === 'undefined') {
        result[key] = undefined;
      } else {
        result[key] = toJsonValue(entry);
      }
    }
    return result;
  }

  return String(value);
}

export interface ConsumeCreditsResult {
  userId: string;
  remainingCredits: number;
}

export async function requireAuthenticatedSupabase() {
  const { userId, getToken } = await auth();

  if (!userId) {
    throw new Error('UNAUTHENTICATED');
  }

  const token = await getToken({ template: 'supabase' });
  if (!token) {
    throw new Error('SUPABASE_TOKEN_MISSING');
  }

  const supabase = createClerkSupabaseClient(token);
  return { userId, supabase };
}

async function ensureUserCreditsRow(userId: string, supabase: ReturnType<typeof createClerkSupabaseClient>) {
  const { data, error } = await supabase
    .from('user_credits')
    .select('user_id, credits')
    .eq('user_id', userId)
    .single();

  if (!error && data) {
    return data;
  }

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_credits')
    .insert({ user_id: userId, credits: 1000 })
    .select('user_id, credits')
    .single();

  if (insertError || !inserted) {
    throw insertError || new Error('Failed to initialize user credits');
  }

  return inserted;
}

export async function consumeCredits(params: {
  action: BillingAction;
  quote: BillingQuote;
  meta?: CreditTransactionMeta;
}): Promise<ConsumeCreditsResult> {
  const { userId, supabase } = await requireAuthenticatedSupabase();
  const current = await ensureUserCreditsRow(userId, supabase);
  const requiredCredits = params.quote.credits;

  if (current.credits < requiredCredits) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  const nextCredits = current.credits - requiredCredits;

  const { error: updateError } = await supabase
    .from('user_credits')
    .update({ credits: nextCredits })
    .eq('user_id', userId);

  if (updateError) {
    throw updateError;
  }

  const meta = toJsonValue({
    ...(params.meta || {}),
    quote: params.quote,
  });

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    action: params.action,
    credits: requiredCredits,
    direction: 'debit',
    status: 'success',
    meta,
  });

  return {
    userId,
    remainingCredits: nextCredits,
  };
}

export async function refundCredits(params: {
  action: BillingAction;
  quote: BillingQuote;
  meta?: CreditTransactionMeta;
}) {
  const { userId, supabase } = await requireAuthenticatedSupabase();
  const current = await ensureUserCreditsRow(userId, supabase);
  const refundAmount = params.quote.credits;
  const nextCredits = current.credits + refundAmount;

  const { error: updateError } = await supabase
    .from('user_credits')
    .update({ credits: nextCredits })
    .eq('user_id', userId);

  if (updateError) {
    throw updateError;
  }

  const meta = toJsonValue({
    ...(params.meta || {}),
    quote: params.quote,
  });

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    action: params.action,
    credits: refundAmount,
    direction: 'refund',
    status: 'refunded',
    meta,
  });

  return {
    userId,
    remainingCredits: nextCredits,
  };
}

export async function refundCreditsIfNotAlreadyRefunded(params: {
  action: BillingAction;
  quote: BillingQuote;
  refundKey: string;
  meta?: CreditTransactionMeta;
}) {
  const { userId, supabase } = await requireAuthenticatedSupabase();

  const { data: existingRefund } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('action', params.action)
    .eq('direction', 'refund')
    .contains('meta', { refundKey: params.refundKey })
    .maybeSingle();

  if (existingRefund) {
    const current = await ensureUserCreditsRow(userId, supabase);
    return {
      userId,
      remainingCredits: current.credits,
      skipped: true,
    };
  }

  const current = await ensureUserCreditsRow(userId, supabase);
  const refundAmount = params.quote.credits;
  const nextCredits = current.credits + refundAmount;

  const { error: updateError } = await supabase
    .from('user_credits')
    .update({ credits: nextCredits })
    .eq('user_id', userId);

  if (updateError) {
    throw updateError;
  }

  const meta = toJsonValue({
    ...(params.meta || {}),
    refundKey: params.refundKey,
    quote: params.quote,
  });

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    action: params.action,
    credits: refundAmount,
    direction: 'refund',
    status: 'refunded',
    meta,
  });

  return {
    userId,
    remainingCredits: nextCredits,
    skipped: false,
  };
}
