import type { CreditAction } from '@/lib/credits';
import {
  createServiceRoleSupabaseClient,
  type AsyncGenerationJobRow,
  type Json,
} from '@/lib/supabase';

export type AsyncGenerationJobKind = 'upscale' | 'motion_transfer';
export type AsyncGenerationJobStatus =
  | 'created'
  | 'starting'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'outcome_unknown';

interface AsyncGenerationJobIdentity {
  requestId: string;
  userId: string;
  kind: AsyncGenerationJobKind;
}

export class AsyncGenerationTaskBindingError extends Error {
  constructor(readonly taskId: string) {
    super('ASYNC_GENERATION_TASK_BINDING_FAILED');
    this.name = 'AsyncGenerationTaskBindingError';
  }
}

export async function findAsyncGenerationJobByRequest(params: AsyncGenerationJobIdentity) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('async_generation_jobs')
    .select('*')
    .eq('request_id', params.requestId)
    .eq('user_id', params.userId)
    .eq('kind', params.kind)
    .maybeSingle();

  if (error) throw error;
  return data as AsyncGenerationJobRow | null;
}

export async function createAsyncGenerationJob(params: AsyncGenerationJobIdentity & {
  creditType: CreditAction;
  chargedCredits: number;
  meta?: Json;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('async_generation_jobs')
    .insert({
      request_id: params.requestId,
      user_id: params.userId,
      kind: params.kind,
      credit_type: params.creditType,
      charged_credits: params.chargedCredits,
      status: 'created',
      meta: params.meta || {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as AsyncGenerationJobRow;
}

export async function bindAsyncGenerationTask(params: AsyncGenerationJobIdentity & {
  taskId: string;
  status?: AsyncGenerationJobStatus;
  outputUrl?: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('async_generation_jobs')
      .update({
        task_id: params.taskId,
        status: params.status || 'queued',
        output_url: params.outputUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('request_id', params.requestId)
      .eq('user_id', params.userId)
      .eq('kind', params.kind)
      .in('status', ['created', 'starting', 'queued', 'running', 'outcome_unknown'])
      .select('*')
      .maybeSingle();

    if (!error && data?.task_id === params.taskId) return data as AsyncGenerationJobRow;

    const current = await findAsyncGenerationJobByRequest(params).catch(() => null);
    if (current?.task_id === params.taskId) return current;
    if (current?.task_id && current.task_id !== params.taskId) {
      throw new Error('ASYNC_GENERATION_TASK_ID_CONFLICT');
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }

  throw new AsyncGenerationTaskBindingError(params.taskId);
}

export async function findOwnedAsyncGenerationJob(params: {
  userId: string;
  kind: AsyncGenerationJobKind;
  taskId: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from('async_generation_jobs')
    .select('*')
    .eq('user_id', params.userId)
    .eq('kind', params.kind)
    .eq('task_id', params.taskId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as AsyncGenerationJobRow;

  const { data: recoveryData, error: recoveryError } = await supabase
    .from('async_generation_jobs')
    .select('*')
    .eq('user_id', params.userId)
    .eq('kind', params.kind)
    .contains('meta', { recoveryTaskId: params.taskId })
    .limit(1)
    .maybeSingle();
  if (recoveryError) throw recoveryError;
  return recoveryData as AsyncGenerationJobRow | null;
}

export async function updateAsyncGenerationJob(params: AsyncGenerationJobIdentity & {
  status: AsyncGenerationJobStatus;
  outputUrl?: string;
  failureReason?: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const update: {
    status: AsyncGenerationJobStatus;
    updated_at: string;
    output_url?: string;
    failure_reason?: string;
  } = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (params.outputUrl) update.output_url = params.outputUrl;
  if (params.failureReason) update.failure_reason = params.failureReason.slice(0, 1_000);

  const { data, error } = await supabase
    .from('async_generation_jobs')
    .update(update)
    .eq('request_id', params.requestId)
    .eq('user_id', params.userId)
    .eq('kind', params.kind)
    .in('status', ['created', 'starting', 'queued', 'running'])
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const current = await findAsyncGenerationJobByRequest(params);
    if (current) return current;
    throw new Error('ASYNC_GENERATION_JOB_NOT_FOUND');
  }
  return data as AsyncGenerationJobRow;
}

export async function settleAsyncGenerationJob(params: {
  job: AsyncGenerationJobRow;
  status: 'succeeded' | 'failed' | 'cancelled' | 'outcome_unknown';
  outputUrl?: string;
  failureReason?: string;
  meta?: Json;
  refund?: boolean;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc('settle_async_generation_job_atomic', {
    p_request_id: params.job.request_id,
    p_user_id: params.job.user_id,
    p_kind: params.job.kind,
    p_terminal_status: params.status,
    p_output_url: params.outputUrl || null,
    p_failure_reason: params.failureReason?.slice(0, 1_000) || null,
    p_meta: params.meta || {},
    p_refund: params.refund ?? true,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result?.success && result?.error_code !== 'ASYNC_JOB_TERMINAL_CONFLICT') {
    throw new Error(result?.error_code || 'ASYNC_GENERATION_SETTLEMENT_FAILED');
  }

  const current = await findAsyncGenerationJobByRequest({
    requestId: params.job.request_id,
    userId: params.job.user_id,
    kind: params.job.kind as AsyncGenerationJobKind,
  });
  if (!current) throw new Error('ASYNC_GENERATION_JOB_NOT_FOUND');
  return current;
}
