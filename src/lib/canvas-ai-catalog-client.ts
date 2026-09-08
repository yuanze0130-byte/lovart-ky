'use client';

import { authedFetch } from './authed-fetch';
import type { CanvasAiModel } from './canvas-ai';

let pending: Promise<CanvasAiModel[]> | undefined;

// Share only the in-flight request, not credentials or persistent user-scoped data.
export function loadCanvasAiCatalog() {
  if (!pending) {
    pending = authedFetch('/api/canvas-ai', { signal: AbortSignal.timeout(15000) }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.models)) throw new Error(result.error || '模型列表读取失败');
      return result.models as CanvasAiModel[];
    }).finally(() => { pending = undefined; });
  }
  return pending;
}
