import { createServerSupabaseClient } from '@/lib/supabase';
import type { UserCreditsRow } from '@/lib/supabase';

export const CREDIT_COSTS = {
  generateImage: 10,
  generateVideo: 30,
  removeBackground: 2,
  upscale: 5,
} as const;

type CreditAction =
  | 'generate_image'
  | 'generate_video'
  | 'remove_background'
  | 'upscale'
  | 'signup_bonus';

export async function ensureUserCredits(userId: string): Promise<UserCreditsRow> {
  const supabase = createServerSupabaseClient();
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
    .insert({ user_id: userId, credits: 1000 })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  const insertedRow = inserted as UserCreditsRow;

  await logCreditTransaction({
    userId,
    amount: 1000,
    type: 'signup_bonus',
    description: '新用户赠送积分',
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
  const supabase = createServerSupabaseClient();

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

async function logCreditTransaction(params: {
  userId: string;
  amount: number;
  type: CreditAction;
  description: string;
  referenceId?: string;
}) {
  const supabase = createServerSupabaseClient();

  try {
    await supabase.from('credit_transactions' as never).insert({
      user_id: params.userId,
      amount: params.amount,
      type: params.type,
      description: params.description,
      reference_id: params.referenceId || null,
    } as never);
  } catch {
    // 流水表尚未创建时忽略，不阻塞主流程
  }
}
