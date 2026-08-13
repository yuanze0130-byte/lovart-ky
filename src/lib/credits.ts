import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import type { UserCreditsRow } from '@/lib/supabase';
import type { Json } from '@/lib/supabase';

export const DEFAULT_SIGNUP_CREDITS = 20;

export type VideoModelMode = 'standard' | 'fast';
export type UpscaleScale = 2 | 4 | 6;

export const CREDIT_COSTS = {
  detectObject: 3,
  removeBackground: 3,
  generateVideo: {
    fast: 18,
    standard: 28,
    pro: 45,
  },
  upscale: {
    2: 4,
    4: 6,
    6: 22,
  },
} as const;

export function getVideoCreditCost(modelMode: VideoModelMode = 'standard') {
  return CREDIT_COSTS.generateVideo[modelMode] ?? CREDIT_COSTS.generateVideo.standard;
}

export function getUpscaleCreditCost(scale: number = 2) {
  if (scale >= 6) return CREDIT_COSTS.upscale[6];
  if (scale >= 4) return CREDIT_COSTS.upscale[4];
  return CREDIT_COSTS.upscale[2];
}

export type CreditAction =
  | 'generate_image'
  | 'generate_video'
  | 'remove_background'
  | 'reverse_prompt'
  | 'upscale'
  | 'signup_bonus'
  | 'agent_chat'
  | 'script_writing'
  | 'video_breakdown'
  | 'manual_adjust'
  | 'redeem_code'
  | 'recharge'
  | 'refund';

export interface SignupBonusClaimResult {
  ok: boolean;
  errorCode: string | null;
  creditsAdded: number;
  currentCredits: number;
  idempotent: boolean;
}

export async function ensureUserCredits(userId: string): Promise<UserCreditsRow> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const existing = data as UserCreditsRow | null;

  if (!error && existing) {
    return existing;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_credits')
    .upsert(
      { user_id: userId, credits: 0 },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  if (insertError) {
    throw insertError;
  }

  if (inserted) return inserted as UserCreditsRow;

  const { data: fetched, error: fetchError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  return fetched as UserCreditsRow;
}

export async function claimSignupBonus(params: {
  userId: string;
  emailHash: string;
  ipHash: string;
  dailyIpLimit: number;
}): Promise<SignupBonusClaimResult> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc('claim_signup_bonus_atomic', {
    p_user_id: params.userId,
    p_email_hash: params.emailHash,
    p_ip_hash: params.ipHash,
    p_amount: DEFAULT_SIGNUP_CREDITS,
    p_daily_ip_limit: params.dailyIpLimit,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('SIGNUP_BONUS_RESULT_MISSING');
  return {
    ok: result.success,
    errorCode: result.error_code,
    creditsAdded: result.credits_added,
    currentCredits: result.current_credits,
    idempotent: result.idempotent,
  };
}

export async function getUserCredits(userId: string) {
  const row = await ensureUserCredits(userId);
  return row.credits;
}

export async function consumeCredits(params: {
  userId: string;
  amount: number;
  type: CreditAction;
  description: string;
  referenceId?: string;
  referenceType?: string;
  meta?: Json;
}) {
  const { userId, amount, type, description, referenceId, referenceType, meta } = params;
  const supabase = createServiceRoleSupabaseClient();

  if (referenceId) {
    const { data, error } = await supabase.rpc('consume_credits_atomic', {
      p_user_id: userId,
      p_amount: amount,
      p_type: type,
      p_description: description,
      p_reference_id: referenceId,
      p_reference_type: referenceType || null,
      p_meta: meta || {},
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result?.success) {
      return {
        ok: false as const,
        currentCredits: result?.current_credits ?? 0,
        requiredCredits: result?.required_credits ?? amount,
        errorCode: result?.error_code || 'CREDIT_DEBIT_FAILED',
      };
    }
    return {
      ok: true as const,
      currentCredits: result.current_credits,
      requiredCredits: result.required_credits,
      transactionId: result.transaction_id,
      idempotent: result.idempotent,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await ensureUserCredits(userId);
    if (current.credits < amount) {
      return {
        ok: false as const,
        currentCredits: current.credits,
        requiredCredits: amount,
      };
    }

    const nextCredits = current.credits - amount;
    const { data, error } = await supabase
      .from('user_credits')
      .update({ credits: nextCredits })
      .eq('user_id', userId)
      .eq('credits', current.credits)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      continue;
    }

    const updatedRow = data as UserCreditsRow;

    await logCreditTransaction({
      userId,
      amount: -amount,
      type,
      description,
      referenceId,
    });

    return {
      ok: true as const,
      currentCredits: updatedRow.credits,
      requiredCredits: amount,
    };
  }

  throw new Error('Credit update conflict, please retry');
}

export async function refundCredits(params: {
  userId: string;
  amount: number;
  type: CreditAction;
  description: string;
  referenceId?: string;
  originalType?: CreditAction;
  meta?: Json;
}) {
  const { userId, amount, type, description, referenceId, originalType, meta } = params;
  const supabase = createServiceRoleSupabaseClient();

  if (referenceId && originalType) {
    const { data, error } = await supabase.rpc('refund_credits_atomic', {
      p_user_id: userId,
      p_reference_id: referenceId,
      p_original_type: originalType,
      p_description: description,
      p_meta: meta || {},
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result?.success) {
      return {
        ok: false as const,
        currentCredits: result?.current_credits ?? 0,
        refundedCredits: 0,
        errorCode: result?.error_code || 'CREDIT_REFUND_FAILED',
      };
    }
    return {
      ok: true as const,
      currentCredits: result.current_credits,
      refundedCredits: result.refunded_credits,
      transactionId: result.transaction_id,
      idempotent: result.idempotent,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await ensureUserCredits(userId);
    const nextCredits = current.credits + amount;

    const { data, error } = await supabase
      .from('user_credits')
      .update({ credits: nextCredits })
      .eq('user_id', userId)
      .eq('credits', current.credits)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      continue;
    }

    const updatedRow = data as UserCreditsRow;

    await logCreditTransaction({
      userId,
      amount,
      type,
      description,
      referenceId,
    });

    return {
      ok: true as const,
      currentCredits: updatedRow.credits,
      refundedCredits: amount,
    };
  }

  throw new Error('Credit refund conflict, please retry');
}

async function logCreditTransaction(params: {
  userId: string;
  amount: number;
  type: CreditAction;
  description: string;
  referenceId?: string;
  referenceType?: string;
  balanceAfter?: number;
}) {
  const supabase = createServiceRoleSupabaseClient();

  try {
    await supabase.from('credit_transactions' as never).insert({
      user_id: params.userId,
      amount: params.amount,
      type: params.type,
      description: params.description,
      reference_id: params.referenceId || null,
      reference_type: params.referenceType || null,
      balance_after: params.balanceAfter ?? null,
    } as never);
  } catch {
    // 流水表尚未创建时忽略，不阻塞主流程。
  }
}
