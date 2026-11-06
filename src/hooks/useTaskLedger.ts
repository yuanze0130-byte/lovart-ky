'use client';
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import type { ImageLedgerEntry, VideoLedgerEntry } from '@/lib/canvas-task-view';

type Ledger = { scope: string; images: ImageLedgerEntry[]; videos: VideoLedgerEntry[]; errors: string[]; loaded: boolean };
const empty: Ledger = { scope: '', images: [], videos: [], errors: [], loaded: false };
export function useTaskLedger(projectId?: string | null, userId?: string | null) {
  const scope = `${userId || ''}:${projectId || ''}`;
  const [state, setState] = useState<Ledger>(empty);
  useEffect(() => {
    if (!projectId || !userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const read = async (kind: 'image' | 'video') => {
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const response = await authedFetch(`/api/projects/${kind}-runs?id=${encodeURIComponent(projectId)}&history=1`, { signal: request.signal });
            if (!response.ok) throw new Error('读取失败');
            const rows = await response.json();
            if (!Array.isArray(rows)) throw new Error('任务记录格式异常');
            return rows;
          })(),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => { request.abort(); reject(new Error('读取超时')); }, 15_000);
          }),
        ]);
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort', abort);
      }
    };
    const poll = async () => {
      const [images, videos] = await Promise.allSettled([read('image'), read('video')]);
      if (cancelled) return;
      setState(previous => {
        const current = previous.scope === scope ? previous : empty;
        return { scope, loaded: true,
          images: images.status === 'fulfilled' ? images.value : current.images,
          videos: videos.status === 'fulfilled' ? videos.value : current.videos,
          errors: [images.status === 'rejected' ? '图片任务暂时无法读取' : '', videos.status === 'rejected' ? '视频任务暂时无法读取' : ''].filter(Boolean),
        };
      });
      timer = setTimeout(() => void poll(), 10_000);
    };
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [projectId, userId, scope]);
  return state.scope === scope ? state : empty;
}
