import { consumeCredits, refundCredits, type CreditAction } from '@/lib/credits';
import { createServiceRoleSupabaseClient, type Json } from '@/lib/supabase';

const ACTIVE_AI_OPERATIONS = Symbol.for('doodleverse.activeAiOperations');

type ActiveOperation = { userId: string; scope: string };
type AiSafetyGlobal = { [ACTIVE_AI_OPERATIONS]?: Map<string, ActiveOperation> };

export class AiSafetyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AiSafetyError';
  }
}

function positiveIntegerEnv(name: string, fallback: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

function getDailyBudgetMicros() {
  const units = Number(process.env.AI_DAILY_COST_LIMIT_UNITS || 50);
  if (!Number.isFinite(units) || units <= 0) return 5_000_000;
  return Math.min(Math.round(units * 100_000), 1_000_000_000);
}

export function estimatedCostMicrosFromCredits(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return 1;
  return Math.max(1, Math.floor((credits * 100_000 * 10_000) / (12 * 10_500)));
}

function assertAiEnabled() {
  if (process.env.AI_KILL_SWITCH?.trim().toLowerCase() === 'true') {
    throw new AiSafetyError('AI 生成功能正在维护，请稍后再试', 503, 'AI_KILL_SWITCH');
  }
}

export async function reserveAiBudget(params: {
  requestId: string;
  userId: string;
  scope: string;
  estimatedCostMicros: number;
}) {
  assertAiEnabled();
  if (!Number.isSafeInteger(params.estimatedCostMicros) || params.estimatedCostMicros <= 0) {
    throw new AiSafetyError('AI 成本配置无效', 503, 'AI_COST_CONFIG_INVALID');
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc('reserve_ai_cost_atomic', {
    p_request_id: params.requestId,
    p_user_id: params.userId,
    p_scope: params.scope,
    p_estimated_cost_micros: params.estimatedCostMicros,
    p_daily_limit_micros: getDailyBudgetMicros(),
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result?.success) {
    throw new AiSafetyError('今日公测生成预算已用完，请明天再试', 503, result?.error_code || 'DAILY_AI_BUDGET_EXCEEDED');
  }
  return result;
}

export async function finalizeAiBudget(requestId: string, status: 'completed' | 'released') {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.rpc('finalize_ai_cost_reservation', {
    p_request_id: requestId,
    p_status: status,
  });
  if (error) throw error;
}

function activeOperations() {
  const state = globalThis as typeof globalThis & AiSafetyGlobal;
  state[ACTIVE_AI_OPERATIONS] ??= new Map<string, ActiveOperation>();
  return state[ACTIVE_AI_OPERATIONS];
}

export function acquireAiExecution(params: { requestId: string; userId: string; scope: string }) {
  const active = activeOperations();
  const existing = active.get(params.requestId);
  if (existing) {
    throw new AiSafetyError('相同任务正在处理中', 409, 'AI_REQUEST_IN_PROGRESS');
  }

  const globalLimit = positiveIntegerEnv('AI_MAX_CONCURRENT_TASKS', 4, 32);
  const userLimit = positiveIntegerEnv('AI_MAX_CONCURRENT_TASKS_PER_USER', 1, 4);
  let userActive = 0;
  for (const operation of active.values()) {
    if (operation.userId === params.userId) userActive += 1;
  }
  if (userActive >= userLimit) {
    throw new AiSafetyError('你已有 AI 任务正在处理，请完成后再试', 429, 'AI_USER_CONCURRENCY_LIMIT', 10);
  }
  if (active.size >= globalLimit) {
    throw new AiSafetyError('当前生成队列已满，请稍后再试', 503, 'AI_GLOBAL_CONCURRENCY_LIMIT', 10);
  }

  active.set(params.requestId, { userId: params.userId, scope: params.scope });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active.delete(params.requestId);
  };
}

export async function runMeteredAiOperation<T>(params: {
  requestId: string;
  userId: string;
  scope: string;
  creditCost: number;
  estimatedCostMicros: number;
  creditType: CreditAction;
  description: string;
  referenceType: string;
  meta?: Json;
  run: () => Promise<T>;
  shouldRefundOnError?: (error: unknown) => boolean;
}) {
  await reserveAiBudget(params);
  let releaseExecution: (() => void) | null = null;
  let creditsConsumed = false;
  let upstreamStarted = false;
  try {
    releaseExecution = acquireAiExecution(params);
    const creditResult = await consumeCredits({
      userId: params.userId,
      amount: params.creditCost,
      type: params.creditType,
      description: params.description,
      referenceId: params.requestId,
      referenceType: params.referenceType,
      meta: params.meta,
    });
    if (!creditResult.ok) {
      throw new AiSafetyError(
        `积分不足，当前 ${creditResult.currentCredits} 积分，本次需要 ${creditResult.requiredCredits} 积分`,
        402,
        'INSUFFICIENT_CREDITS',
      );
    }
    creditsConsumed = true;
    upstreamStarted = true;
    const result = await params.run();
    await finalizeAiBudget(params.requestId, 'completed').catch((error) => {
      console.error('[ai-safety] 无法完成成本预留记录', error);
    });
    return {
      result,
      billing: { requestId: params.requestId, chargedCredits: params.creditCost },
    };
  } catch (error) {
    if (creditsConsumed && (params.shouldRefundOnError?.(error) ?? true)) {
      await refundCredits({
        userId: params.userId,
        amount: params.creditCost,
        type: 'refund',
        description: `${params.description}失败，自动退回积分`,
        referenceId: params.requestId,
        originalType: params.creditType,
        meta: { ...(params.meta && typeof params.meta === 'object' && !Array.isArray(params.meta) ? params.meta : {}), failed: true },
      }).catch((refundError) => console.error('[ai-safety] 自动退款失败', refundError));
    }
    await finalizeAiBudget(params.requestId, upstreamStarted ? 'completed' : 'released').catch((finalizeError) => {
      console.error('[ai-safety] 无法释放成本预留记录', finalizeError);
    });
    throw error;
  } finally {
    releaseExecution?.();
  }
}

export function isAiSafetyError(error: unknown): error is AiSafetyError {
  return error instanceof AiSafetyError;
}
