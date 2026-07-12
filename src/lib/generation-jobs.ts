export type GenerationJobKind = 'image' | 'video' | 'audio' | 'workflow' | 'analysis';
export type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type GenerationJobFailureKind = 'failed' | 'cancelled' | 'timeout' | 'expired';

export interface GenerationJob {
  id: string;
  nodeId: string;
  projectId?: string;
  kind: GenerationJobKind;
  status: GenerationJobStatus;
  progress: number;
  provider?: string;
  model?: string;
  inputAssetIds: string[];
  outputAssetIds: string[];
  outputUrl?: string;
  error?: string;
  failureKind?: GenerationJobFailureKind;
  rawStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  rawPayload?: unknown;
}

export interface NormalizeGenerationJobInput {
  id: string;
  nodeId?: string;
  projectId?: string;
  kind: GenerationJobKind;
  status?: string | null;
  progress?: number | string | null;
  provider?: string;
  model?: string;
  inputAssetIds?: string[];
  outputAssetIds?: string[];
  outputUrl?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  rawPayload?: unknown;
}

const QUEUED_STATUSES = new Set(['queued', 'pending', 'submitted', 'created', 'waiting']);
const RUNNING_STATUSES = new Set(['running', 'processing', 'in_progress', 'in-progress', 'progress', 'generating']);
const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'complete', 'success', 'finished', 'done']);
const FAILED_STATUSES = new Set(['failed', 'failure', 'error']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const TIMEOUT_STATUSES = new Set(['timeout', 'timed_out', 'timed-out']);
const EXPIRED_STATUSES = new Set(['expired']);

export function normalizeProviderStatus(status?: string | null) {
  return (status || '').trim().toLowerCase();
}

export function getGenerationJobFailureKind(status?: string | null): GenerationJobFailureKind | undefined {
  const normalized = normalizeProviderStatus(status);
  if (CANCELLED_STATUSES.has(normalized)) return 'cancelled';
  if (TIMEOUT_STATUSES.has(normalized)) return 'timeout';
  if (EXPIRED_STATUSES.has(normalized)) return 'expired';
  if (FAILED_STATUSES.has(normalized)) return 'failed';
  return undefined;
}

export function normalizeGenerationJobStatus(status?: string | null): GenerationJobStatus {
  const normalized = normalizeProviderStatus(status);
  if (SUCCESS_STATUSES.has(normalized)) return 'succeeded';
  if (CANCELLED_STATUSES.has(normalized)) return 'cancelled';
  if (FAILED_STATUSES.has(normalized) || TIMEOUT_STATUSES.has(normalized) || EXPIRED_STATUSES.has(normalized)) return 'failed';
  if (RUNNING_STATUSES.has(normalized)) return 'running';
  if (QUEUED_STATUSES.has(normalized) || !normalized) return 'queued';
  return 'running';
}

function parseProgress(progress?: number | string | null) {
  if (typeof progress === 'number' && Number.isFinite(progress)) return progress;
  if (typeof progress !== 'string') return undefined;
  const parsed = Number.parseFloat(progress.trim().replace(/%$/, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeGenerationProgress(
  progress: number | string | null | undefined,
  status: GenerationJobStatus,
) {
  const parsed = parseProgress(progress);
  if (parsed !== undefined) return Math.max(0, Math.min(100, parsed));
  if (status === 'succeeded') return 100;
  if (status === 'running') return 50;
  return 0;
}

export function normalizeGenerationJob(input: NormalizeGenerationJobInput): GenerationJob {
  const rawStatus = normalizeProviderStatus(input.status);
  let status = normalizeGenerationJobStatus(rawStatus);
  const progress = normalizeGenerationProgress(input.progress, status);
  if (input.outputUrl && progress >= 100 && status !== 'failed' && status !== 'cancelled') status = 'succeeded';
  return {
    id: input.id,
    nodeId: input.nodeId || input.id,
    projectId: input.projectId,
    kind: input.kind,
    status,
    progress: status === 'succeeded' ? 100 : progress,
    provider: input.provider,
    model: input.model,
    inputAssetIds: [...(input.inputAssetIds || [])],
    outputAssetIds: [...(input.outputAssetIds || [])],
    outputUrl: input.outputUrl,
    error: input.error,
    failureKind: getGenerationJobFailureKind(rawStatus),
    rawStatus: rawStatus || undefined,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    rawPayload: input.rawPayload,
  };
}

export function normalizeVideoGenerationJob(input: Omit<NormalizeGenerationJobInput, 'kind'>) {
  return normalizeGenerationJob({ ...input, kind: 'video' });
}

export function normalizeAsynchronousImageJob(input: Omit<NormalizeGenerationJobInput, 'kind'>) {
  return normalizeGenerationJob({ ...input, kind: 'image' });
}

export function normalizeSynchronousImageJob(input: {
  id: string;
  nodeId?: string;
  provider?: string;
  model?: string;
  outputUrl?: string;
  imageData?: string;
  error?: string;
}) {
  const outputUrl = input.outputUrl || input.imageData;
  return normalizeGenerationJob({
    ...input,
    kind: 'image',
    status: outputUrl ? 'succeeded' : 'failed',
    progress: outputUrl ? 100 : 0,
    outputUrl,
  });
}

export function isGenerationJobReady(job: Pick<GenerationJob, 'status' | 'outputUrl'>) {
  return job.status === 'succeeded' && Boolean(job.outputUrl);
}

export function isGenerationJobTerminal(job: Pick<GenerationJob, 'status'>) {
  return job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled';
}
