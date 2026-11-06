import { consumeCredits, refundCredits, type CreditAction } from '@/lib/credits';
import { createServiceRoleSupabaseClient, type Json } from '@/lib/supabase';
import { randomUUID } from 'node:crypto';
import { AdmissionError, waitForAiAdmission } from '@/lib/ai-execution-admission';

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

export async function acquireAiExecution(params: { requestId: string; userId: string; scope: string; signal?: AbortSignal }) {
  assertAiEnabled();
  const db = createServiceRoleSupabaseClient();
  const token = randomUUID();
  const globalLimit = positiveIntegerEnv('AI_MAX_CONCURRENT_TASKS', 4, 32);
  const userLimit = positiveIntegerEnv('AI_MAX_CONCURRENT_TASKS_PER_USER', 3, 4);
  try {
    await waitForAiAdmission({ signal: params.signal, acquire: async () => {
      const { data, error } = await db.rpc('acquire_canvas_ai_execution', {
        p_request_id: params.requestId, p_user_id: params.userId, p_scope: params.scope,
        p_lease_token: token, p_user_limit: userLimit, p_global_limit: globalLimit,
      });
      if (error) throw error;
      return data;
    } });
  } catch (error) {
    if (error instanceof AdmissionError && error.reason === 'duplicate') {
      throw new AiSafetyError('相同请求已登记，请核对任务记录，未重复提交', 409, 'AI_REQUEST_IN_PROGRESS');
    }
    throw new AiSafetyError('暂时无法取得生成名额，本次未提交或扣费，请稍后重试', 503, 'AI_ADMISSION_UNAVAILABLE', 10);
  }
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try { const { error } = await db.rpc('release_canvas_ai_execution', {
      p_request_id: params.requestId, p_user_id: params.userId, p_lease_token: token,
    });
    if (error) throw error;
    } catch { console.error('[ai-safety] 执行名额暂未释放，将由租约过期回收'); }
  };
  if (params.signal?.aborted) {
    await release();
    throw new AiSafetyError('请求已取消，未提交生成', 409, 'AI_NOT_SUBMITTED');
  }
  return release;
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
  let releaseExecution: (() => Promise<void>) | null = null;
  let budgetReserved = false;
  let creditsConsumed = false;
  let upstreamStarted = false;
  try {
    releaseExecution = await acquireAiExecution(params);
    await reserveAiBudget(params);
    budgetReserved = true;
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
    if (creditResult.idempotent) throw new AiSafetyError('该请求已经处理，请核对已有结果', 409, 'AI_REQUEST_ALREADY_USED');
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
    if (budgetReserved) await finalizeAiBudget(params.requestId, upstreamStarted ? 'completed' : 'released').catch((finalizeError) => {
      console.error('[ai-safety] 无法释放成本预留记录', finalizeError);
    });
    throw error;
  } finally {
    await releaseExecution?.();
  }
}

export function isAiSafetyError(error: unknown): error is AiSafetyError {
  return error instanceof AiSafetyError;
}
