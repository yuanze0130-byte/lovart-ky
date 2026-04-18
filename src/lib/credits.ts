import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import type { UserCreditsRow } from '@/lib/supabase';

export const DEFAULT_SIGNUP_CREDITS = 30;

export type ImageModelVariant = 'standard' | 'pro';
export type ImageResolution = '1K' | '2K' | '4K';
export type VideoModelMode = 'standard' | 'fast';
export type UpscaleScale = 2 | 4 | 6;

export const CREDIT_COSTS = {
  detectObject: 3,
  reversePrompt: 3,
  removeBackground: 3,
  generateImage: {
    standard: {
      '1K': 2,
      '2K': 3,
      '4K': 4,
    },
    pro: {
      '1K': 4,
      '2K': 5,
      '4K': 6,
    },
  },
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

export function getImageCreditCost(modelVariant: ImageModelVariant = 'pro', resolution: ImageResolution = '1K') {
  return CREDIT_COSTS.generateImage[modelVariant][resolution];
}

export function getVideoCreditCost(modelMode: VideoModelMode = 'standard') {
  return CREDIT_COSTS.generateVideo[modelMode] ?? CREDIT_COSTS.generateVideo.standard;
}

export function getUpscaleCreditCost(scale: number = 2) {
  if (scale >= 6) return CREDIT_COSTS.upscale[6];
  if (scale >= 4) return CREDIT_COSTS.upscale[4];
  return CREDIT_COSTS.upscale[2];
}

type CreditAction =
  | 'generate_image'
  | 'generate_video'
  | 'remove_background'
  | 'upscale'
  | 'signup_bonus'
  | 'manual_adjust';

export async function ensureUserCredits(userId: string): Promise<UserCreditsRow> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  const existing = data as UserCreditsRow | null;

  if (!error && existing) {
    return existing;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_credits')
    .insert({ user_id: userId, credits: DEFAULT_SIGNUP_CREDITS })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  const insertedRow = inserted as UserCreditsRow;

  await logCreditTransaction({
    userId,
    amount: DEFAULT_SIGNUP_CREDITS,
    type: 'signup_bonus',
    description: `新用户赠送 ${DEFAULT_SIGNUP_CREDITS} 积分`,
  });

  return insertedRow;
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
}) {
  const { userId, amount, type, description, referenceId } = params;
  const supabase = createServiceRoleSupabaseClient();

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
    .select()
    .single();

  if (error) {
    throw error;
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

export async function refundCredits(params: {
  userId: string;
  amount: number;
  type: CreditAction;
  description: string;
  referenceId?: string;
}) {
  const { userId, amount, type, description, referenceId } = params;
  const supabase = createServiceRoleSupabaseClient();

  const current = await ensureUserCredits(userId);
  const nextCredits = current.credits + amount;

  const { data, error } = await supabase
    .from('user_credits')
    .update({ credits: nextCredits })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw error;
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

async function logCreditTransaction(params: {
  userId: string;
  amount: number;
  type: CreditAction;
  description: string;
  referenceId?: string;
}) {
  const supabase = createServiceRoleSupabaseClient();

  try {
    await supabase.from('credit_transactions' as never).insert({
      user_id: params.userId,
      amount: params.amount,
      type: params.type,
      description: params.description,
      reference_id: params.referenceId || null,
    } as never);
  } catch {
    // 流水表尚未创建时忽略，不阻塞主流程。
  }
}
