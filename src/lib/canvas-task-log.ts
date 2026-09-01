import type { GenerationJobKind, GenerationJobStatus } from '@/lib/generation-jobs';

export type CanvasTaskLogLevel = 'info' | 'warning' | 'error';

export interface CanvasTaskLogEntry {
  id: string;
  projectId: string;
  nodeId?: string;
  taskId?: string;
  kind: GenerationJobKind;
  status: GenerationJobStatus;
  level: CanvasTaskLogLevel;
  progress: number;
  message: string;
  provider?: string;
  model?: string;
  promptPreview?: string;
  referenceCount?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CanvasTaskLogServerRow {
  project_id: string;
  id: string;
  user_id: string;
  node_id: string | null;
  task_id: string | null;
  kind: string;
  status: string;
  level: string;
  progress: number;
  message: string;
  provider: string | null;
  model: string | null;
  prompt_preview: string | null;
  reference_count: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type CanvasTaskLogUpdate = Pick<CanvasTaskLogEntry, 'id' | 'kind' | 'status' | 'message'>
  & Partial<Omit<CanvasTaskLogEntry, 'id' | 'kind' | 'status' | 'message' | 'projectId'>>;

export const CANVAS_TASK_LOG_CHANGED_EVENT = 'doodleverse-canvas-task-log-changed';
export const CANVAS_TASK_RETRY_EVENT = 'doodleverse-canvas-task-retry';
export const MAX_CANVAS_TASK_LOG_ENTRIES = 200;

const TASK_KINDS: GenerationJobKind[] = ['image', 'video', 'audio', 'workflow', 'analysis'];
const TASK_STATUSES: GenerationJobStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];
const TASK_LEVELS: CanvasTaskLogLevel[] = ['info', 'warning', 'error'];

export interface CanvasTaskRetryEventDetail {
  nodeId: string;
}

export function dispatchCanvasTaskRetry(nodeId: string) {
  window.dispatchEvent(new CustomEvent<CanvasTaskRetryEventDetail>(CANVAS_TASK_RETRY_EVENT, {
    detail: { nodeId },
  }));
}

function clampProgress(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function defaultLevel(status: GenerationJobStatus): CanvasTaskLogLevel {
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'warning';
  return 'info';
}

export function getCanvasTaskLogStorageKey(projectId?: string | null) {
  return `doodleverse.canvas-task-log.${projectId || 'local'}`;
}

export function mergeCanvasTaskLogEntry(
  existing: CanvasTaskLogEntry | undefined,
  update: CanvasTaskLogUpdate,
  projectId?: string | null,
  now = new Date().toISOString(),
): CanvasTaskLogEntry {
  const status = update.status;
  const terminal = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  return {
    id: update.id,
    projectId: projectId || existing?.projectId || 'local',
    nodeId: cleanText(update.nodeId, 160) ?? existing?.nodeId,
    taskId: cleanText(update.taskId, 240) ?? existing?.taskId,
    kind: update.kind,
    status,
    level: update.level || defaultLevel(status),
    progress: status === 'succeeded' ? 100 : clampProgress(update.progress ?? existing?.progress),
    message: cleanText(update.message, 500) || existing?.message || '任务状态已更新',
    provider: cleanText(update.provider, 120) ?? existing?.provider,
    model: cleanText(update.model, 160) ?? existing?.model,
    promptPreview: cleanText(update.promptPreview, 300) ?? existing?.promptPreview,
    referenceCount: typeof update.referenceCount === 'number'
      ? Math.max(0, Math.round(update.referenceCount))
      : existing?.referenceCount,
    error: cleanText(update.error, 1_000) ?? (status === 'failed' ? existing?.error : undefined),
    createdAt: existing?.createdAt || update.createdAt || now,
    updatedAt: now,
    completedAt: terminal ? update.completedAt || existing?.completedAt || now : undefined,
  };
}

export function upsertCanvasTaskLogEntries(
  entries: CanvasTaskLogEntry[],
  update: CanvasTaskLogUpdate,
  projectId?: string | null,
  now = new Date().toISOString(),
) {
  const existing = entries.find((entry) => entry.id === update.id);
  const merged = mergeCanvasTaskLogEntry(existing, update, projectId, now);
  return [merged, ...entries.filter((entry) => entry.id !== update.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_CANVAS_TASK_LOG_ENTRIES);
}

export function mergeCanvasTaskLogCollections(...collections: CanvasTaskLogEntry[][]) {
  const byId = new Map<string, CanvasTaskLogEntry>();
  collections.flat().forEach((entry) => {
    const existing = byId.get(entry.id);
    if (!existing || entry.updatedAt.localeCompare(existing.updatedAt) > 0) byId.set(entry.id, entry);
  });
  return Array.from(byId.values())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_CANVAS_TASK_LOG_ENTRIES);
}

export function canvasTaskLogEntryToServerRow(entry: CanvasTaskLogEntry, userId: string): CanvasTaskLogServerRow {
  return {
    project_id: entry.projectId,
    id: entry.id,
    user_id: userId,
    node_id: entry.nodeId || null,
    task_id: entry.taskId || null,
    kind: entry.kind,
    status: entry.status,
    level: entry.level,
    progress: clampProgress(entry.progress),
    message: entry.message,
    provider: entry.provider || null,
    model: entry.model || null,
    prompt_preview: entry.promptPreview || null,
    reference_count: typeof entry.referenceCount === 'number' ? entry.referenceCount : null,
    error: entry.error || null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    completed_at: entry.completedAt || null,
  };
}

export function canvasTaskLogServerRowToEntry(row: CanvasTaskLogServerRow): CanvasTaskLogEntry | null {
  if (!TASK_KINDS.includes(row.kind as GenerationJobKind)
    || !TASK_STATUSES.includes(row.status as GenerationJobStatus)
    || !TASK_LEVELS.includes(row.level as CanvasTaskLogLevel)) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id || undefined,
    taskId: row.task_id || undefined,
    kind: row.kind as GenerationJobKind,
    status: row.status as GenerationJobStatus,
    level: row.level as CanvasTaskLogLevel,
    progress: clampProgress(row.progress),
    message: row.message,
    provider: row.provider || undefined,
    model: row.model || undefined,
    promptPreview: row.prompt_preview || undefined,
    referenceCount: typeof row.reference_count === 'number' ? row.reference_count : undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || undefined,
  };
}

export function loadCanvasTaskLogEntries(projectId?: string | null): CanvasTaskLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getCanvasTaskLogStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is CanvasTaskLogEntry => Boolean(
        entry && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.message === 'string'
      )).slice(0, MAX_CANVAS_TASK_LOG_ENTRIES)
      : [];
  } catch {
    return [];
  }
}

export function saveCanvasTaskLogEntries(projectId: string | null | undefined, entries: CanvasTaskLogEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getCanvasTaskLogStorageKey(projectId),
      JSON.stringify(entries.slice(0, MAX_CANVAS_TASK_LOG_ENTRIES)),
    );
  } catch {
    // Task logs are diagnostic data; generation must continue if browser storage is unavailable.
  }
}
