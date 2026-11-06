// Provider payload adapters. These do not enable billing or bypass server quotes.
// Vidu: Comfly /vidu/v2 + official viduq4-preview image/reference schemas.
export function buildViduQ4Request(input: {
  prompt: string; images: string[]; duration: number; resolution: string;
  aspectRatio: string; generateAudio: boolean;
}) {
  if (!input.prompt.trim() || input.prompt.length > 20000
    || !Number.isInteger(input.duration) || input.duration < 3 || input.duration > 16
    || !['540p', '720p', '1080p', '2K', '4K'].includes(input.resolution)
    || !['1:1', '9:16', '16:9', '3:4', '4:3'].includes(input.aspectRatio)
    || input.images.length < 1 || input.images.length > 15
    || !input.images.every((image) => typeof image === 'string' && /^https:\/\//.test(image))) {
    throw new Error('Vidu Q4 参数无效；目前仅支持 HTTPS 参考图');
  }
  return {
    path: input.images.length === 1 ? '/vidu/v2/img2video' : '/vidu/v2/reference2video',
    body: { model: 'viduq4-preview', prompt: input.prompt, images: [...input.images],
      duration: input.duration, resolution: input.resolution, aspect_ratio: input.aspectRatio,
      audio: input.generateAudio, watermark: false },
  };
}

export function viduTaskPath(id: string) {
  if (!id || id.length > 200) throw new Error('Invalid Vidu task ID');
  return `/vidu/v2/tasks/${encodeURIComponent(id)}/creations`;
}

export function parseNativeVideoResult(value: unknown, provider: 'vidu' | 'kling') {
  if (!value || typeof value !== 'object') throw new Error('Invalid video result');
  const root = value as Record<string, unknown>;
  const data = provider === 'kling' ? root.data as Record<string, unknown> | undefined : root;
  if (!data || (provider === 'kling' && root.code !== 0)) throw new Error('Video request rejected');
  const id = data.task_id ?? data.id;
  const raw = provider === 'kling' ? data.task_status : data.state;
  const statuses: Record<string, string> = { created: 'queued', queueing: 'queued', submitted: 'queued', processing: 'running', succeed: 'succeeded', success: 'succeeded', failed: 'failed' };
  if (typeof id !== 'string' || typeof raw !== 'string' || !Object.hasOwn(statuses, raw)) throw new Error('Unknown video result status');
  const result = data.task_result as { videos?: Array<{ url?: unknown }> } | undefined;
  const creations = data.creations as Array<{ url?: unknown }> | undefined;
  const url = provider === 'kling' ? result?.videos?.[0]?.url : creations?.[0]?.url;
  const units = provider === 'kling' ? data.final_unit_deduction : data.credits;
  const usage = typeof units === 'number' ? units : typeof units === 'string' && units.trim() ? Number(units) : undefined;
  if (usage !== undefined && (!Number.isFinite(usage) || usage < 0 || usage > 1_000_000_000)) throw new Error('Invalid video usage');
  const status = statuses[raw];
  if (status === 'succeeded' && (typeof url !== 'string' || !/^https:\/\//.test(url))) throw new Error('Completed video has no valid result');
  // Keep usage separate from canvas credits. Missing usage must not become zero.
  return { taskId: id, status, videoUrl: status === 'succeeded' ? url as string : undefined,
    upstreamUsage: usage, upstreamUnit: provider === 'kling' ? 'kling-credit' : 'vidu-credit' };
}
