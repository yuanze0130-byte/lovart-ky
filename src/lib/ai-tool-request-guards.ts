const RATE_LIMIT_BUCKETS = Symbol.for('doodleverse.aiToolRateLimitBuckets');

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitGlobal {
  [RATE_LIMIT_BUCKETS]?: Map<string, RateLimitBucket>;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now?: number;
}

export interface ScriptWritingRequest {
  brief: string;
  genre: string;
  durationMinutes: number;
  characters: string;
}

export interface VideoBreakdownFrameRequest {
  dataUrl: string;
  label: string;
}

export interface VideoBreakdownRequest {
  frames: VideoBreakdownFrameRequest[];
  duration: number;
  prompt: string;
}

export class AiToolRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AiToolRequestError';
  }
}

function requestError(message: string, status = 400, code = 'INVALID_REQUEST'): never {
  throw new AiToolRequestError(message, status, code);
}

function getRateLimitBuckets() {
  const globalStore = globalThis as typeof globalThis & RateLimitGlobal;
  globalStore[RATE_LIMIT_BUCKETS] ??= new Map<string, RateLimitBucket>();
  return globalStore[RATE_LIMIT_BUCKETS];
}

function cleanExpiredBuckets(buckets: Map<string, RateLimitBucket>, now: number) {
  if (buckets.size < 1_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function assertDeclaredBodySize(request: Request, maxBytes: number) {
  const rawLength = request.headers.get('content-length');
  if (!rawLength) return;
  if (!/^\d+$/.test(rawLength)) requestError('Content-Length 请求头无效', 400, 'INVALID_CONTENT_LENGTH');
  const declaredLength = Number(rawLength);
  if (!Number.isSafeInteger(declaredLength)) requestError('Content-Length 请求头无效', 400, 'INVALID_CONTENT_LENGTH');
  if (declaredLength > maxBytes) requestError('请求内容过大', 413, 'REQUEST_TOO_LARGE');
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  assertDeclaredBodySize(request, maxBytes);

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') requestError('请求必须使用 application/json', 415, 'UNSUPPORTED_MEDIA_TYPE');
  if (request.bodyUsed) requestError('请求内容已被读取', 400, 'BODY_ALREADY_READ');

  const reader = request.body?.getReader();
  if (!reader) requestError('请求内容不能为空', 400, 'EMPTY_BODY');

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('request body exceeded limit');
        requestError('请求内容过大', 413, 'REQUEST_TOO_LARGE');
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } catch (error) {
    if (error instanceof AiToolRequestError) throw error;
    requestError('无法读取请求内容', 400, 'BODY_READ_FAILED');
  }

  try {
    return JSON.parse(parts.join('')) as unknown;
  } catch {
    requestError('请求 JSON 格式无效', 400, 'INVALID_JSON');
  }
}

export function enforceUserRateLimit(userId: string, scope: string, options: RateLimitOptions) {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const buckets = getRateLimitBuckets();
  cleanExpiredBuckets(buckets, now);

  const key = `${scope}:${userId}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
    throw new AiToolRequestError('请求过于频繁，请稍后再试', 429, 'RATE_LIMITED', retryAfterSeconds);
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

function requireObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) requestError('请求内容必须是 JSON 对象');
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, maxLength: number, required = false) {
  if (value === undefined || value === null) {
    if (required) requestError(`${field} 不能为空`);
    return '';
  }
  if (typeof value !== 'string') requestError(`${field} 必须是字符串`);
  const trimmed = value.trim();
  if (required && !trimmed) requestError(`${field} 不能为空`);
  if (trimmed.length > maxLength) requestError(`${field} 不能超过 ${maxLength} 个字符`);
  return trimmed;
}

function boundedNumber(value: unknown, field: string, fallback: number, min: number, max: number) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) requestError(`${field} 必须是有效数字`);
  if (value < min || value > max) requestError(`${field} 必须在 ${min} 到 ${max} 之间`);
  return value;
}

export function parseScriptWritingRequest(value: unknown): ScriptWritingRequest {
  const body = requireObject(value);
  return {
    brief: boundedString(body.brief, '创作要求', 10_000, true),
    genre: boundedString(body.genre, '类型', 80) || '剧情短片',
    durationMinutes: boundedNumber(body.durationMinutes, '目标时长', 3, 1, 60),
    characters: boundedString(body.characters, '角色设定', 6_000),
  };
}

const DATA_IMAGE_HEADER = /^data:image\/(?:jpeg|jpg|png|webp);base64,/i;

export function parseVideoBreakdownRequest(value: unknown): VideoBreakdownRequest {
  const body = requireObject(value);
  if (!Array.isArray(body.frames)) requestError('关键帧必须是数组');
  if (body.frames.length === 0) requestError('请先提供视频关键帧');
  if (body.frames.length > 8) requestError('关键帧不能超过 8 张');

  const frames = body.frames.map((rawFrame, index) => {
    const frame = requireObject(rawFrame);
    const dataUrl = boundedString(frame.dataUrl, `第 ${index + 1} 张关键帧`, 2 * 1024 * 1024, true);
    if (!DATA_IMAGE_HEADER.test(dataUrl)) requestError(`第 ${index + 1} 张关键帧格式无效`);
    return {
      dataUrl,
      label: boundedString(frame.label, `第 ${index + 1} 张关键帧标签`, 80),
    };
  });

  return {
    frames,
    duration: boundedNumber(body.duration, '视频时长', 0, 0, 86_400),
    prompt: boundedString(body.prompt, '额外要求', 2_000),
  };
}

export function isAiToolRequestError(error: unknown): error is AiToolRequestError {
  return error instanceof AiToolRequestError;
}
