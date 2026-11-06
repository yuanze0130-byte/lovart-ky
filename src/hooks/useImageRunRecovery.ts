import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { isImageModelId } from '@/lib/image-models';
import { containsImageResult } from '@/lib/image-versions';

type Run = { request_id: string; status: string; created_at: string; result?: { imageData?: string; recovered?: boolean }; meta: { prompt?: string; generatorId?: string; modelVariant?: string; resolution?: string } };
export function useImageRunRecovery(projectId: string | null, enabled: boolean, setElements: Dispatch<SetStateAction<CanvasElement[]>>, beginOperation?: () => void, owner?: string) {
  const key = `${owner || ''}:${projectId || ''}`;
  const [state, setState] = useState({key:'',message:'',busyNodeIds:[] as string[],runStates:{} as Record<string,string>,ready:false});
  const openedAt = useRef({ projectId, owner, time: Date.now() });
  if (openedAt.current.projectId !== projectId || openedAt.current.owner !== owner) openedAt.current = { projectId, owner, time: Date.now() };
  useEffect(() => {
    if (!projectId || !enabled) return;
    let cancelled = false;
    const opening = openedAt.current;
    const isCurrent = () => !cancelled && openedAt.current === opening;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handled = new Set<string>();
    const controller = new AbortController();
    const poll = async () => {
      try {
        const all: Run[] = [];
        let cursor = '';
        const seenCursors = new Set<string>();
        do {
          if (!isCurrent()) return;
          const response = await authedFetch(`/api/projects/image-runs?id=${projectId}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, {signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15_000)])});
          if (!response.ok) throw new Error('无法查询历史生成任务');
          all.push(...await response.json() as Run[]);
          cursor = response.headers.get('X-Recovery-Cursor') || '';
          if (cursor && seenCursors.has(cursor)) throw new Error('恢复分页未前进');
          if (cursor) seenCursors.add(cursor);
        } while (cursor);
        // Includes current-session results whose POST response was lost. Reads
        // never resubmit generation; result identity makes insertion repeat-safe.
        const runs = all;
        const busyNodeIds = Array.from(new Set(runs.filter(r => r.status === 'running' || r.status === 'outcome_unknown').map(r => r.meta.generatorId).filter((id):id is string => Boolean(id))));
        const updates: Array<(current: CanvasElement[]) => CanvasElement[]> = [];
        const preparedIds = new Set<string>();
        const unavailable = new Set<string>();
        for (const run of runs) {
          if (!isCurrent()) return;
          if (run.status !== 'succeeded' || !run.result?.imageData || handled.has(run.request_id) || preparedIds.has(run.request_id)) continue;
          const content = run.result.imageData;
          let dimensions: Awaited<ReturnType<typeof getImageDimensions>>;
          try {
            dimensions = await getImageDimensions(content);
          } catch {
            // A transient asset failure must not discard other completed results.
            // Leave this run unhandled so a subsequent read can recover it.
            unavailable.add(run.request_id);
            continue;
          }
          const size = getSmartDisplaySize(dimensions);
          if (!isCurrent()) return;
          updates.push(current => {
            if (current.some(e => containsImageResult(e,run.request_id))) return current;
            const source = current.find(e => e.id === run.meta.generatorId);
            const outputIndex = current.filter(e => e.type === 'connector' && e.connectorFrom === source?.id && e.connectorKind === 'result').length;
            const image: CanvasElement = { id: run.request_id, type: 'image', content, x: source ? source.x + (source.width || 320) + 96 + Math.floor(outputIndex / 3) * (size.width + 40) : 100,
              y: (source?.y ?? 100) + (outputIndex % 3) * (size.height + 32), width: size.width, height: size.height, originalWidth: dimensions.width, originalHeight: dimensions.height,
              prompt: run.meta.prompt, generationMetadata: { recoveryRequestId: run.request_id, recoveredAfterReopen: true, modelVariant: isImageModelId(run.meta.modelVariant) ? run.meta.modelVariant : undefined, requestedRecoveryResolution: run.meta.resolution, generatorElementId: source?.id } };
            const next = current.map(e => e.id === source?.id && !busyNodeIds.includes(e.id) ? { ...e, isGenerating: false } : e);
            if (source) next.push({ id: `recovery-link-${run.request_id}`, type: 'connector', x: 0, y: 0, connectorFrom: source.id, connectorTo: image.id,
              connectorKind: 'result', connectorDataKind: 'image', connectorSourcePort: 'image-out', connectorTargetPort: 'image-in' });
            return [...next, image];
          });
          preparedIds.add(run.request_id);
        }
        if (!isCurrent()) return;
        const terminalSources = new Set(runs.filter(r => r.status === 'failed' && !busyNodeIds.includes(r.meta.generatorId || '')).map(r => r.meta.generatorId).filter(Boolean));
        if (terminalSources.size) updates.push(current => current.some(e => terminalSources.has(e.id) && e.isGenerating)
          ? current.map(e => terminalSources.has(e.id) ? { ...e, isGenerating: false } : e) : current);
        if (updates.length) {
          beginOperation?.();
          setElements(current => isCurrent() ? updates.reduce((next, apply) => apply(next), current) : current);
          preparedIds.forEach(id => handled.add(id));
        }
        const pending = runs.filter(r => r.status === 'running').length;
        const unknown = runs.filter(r => r.status === 'outcome_unknown').length;
        setState(previous => ({key,ready:true,busyNodeIds,runStates:{...(previous.key === key ? previous.runStates : {}),...Object.fromEntries(runs.map(run => [run.request_id,run.status]))},message:[
          pending ? `正在恢复 ${pending} 个图片任务…` : '',
          unavailable.size ? `${unavailable.size} 张已完成图片暂时无法读取，稍后自动重试` : '',
          unknown ? `${unknown} 个图片任务结果待核对，请勿重复生成` : '',
        ].filter(Boolean).join('；')}));
        timer = setTimeout(() => void poll(), pending ? 5000 : unavailable.size ? 15000 : 30000);
      } catch {
        if (isCurrent()) { setState(previous => ({...(previous.key === key ? previous : {busyNodeIds:[],runStates:{}}),key,ready:false,message:'任务恢复查询失败，稍后自动重试；暂不重复提交图片任务'})); timer = setTimeout(() => void poll(), 15000); }
      }
    };
    void poll();
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [projectId, enabled, setElements, beginOperation, owner, key]);
  return state.key === key && enabled ? state : {key,message:'',busyNodeIds:[],runStates:{},ready:false};
}
