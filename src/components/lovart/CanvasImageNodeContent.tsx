'use client';
import { memo } from 'react';
import { CanvasImageMedia } from './CanvasMedia';
import { PanoramaViewer } from './PanoramaViewer';
import type { GenerationMetadata } from './CanvasArea';
import { getProviderLabel, getModelLabel, getOfficialOptionChips, getTaskDebugChips, getTaskDebugSummary } from '@/lib/canvas-generation-labels';
interface Props {
  source: string; previewUrl?: string; thumbnailUrl?: string; prompt?: string;
  generationMetadata?: GenerationMetadata; isLowDetail: boolean; hideImages: boolean; priority: boolean;
}
// Position and viewport transforms belong to the outer node. Primitive media
// props let unchanged content skip work while the canvas pans or nodes move.
export const CanvasImageNodeContent = memo(function CanvasImageNodeContent({source, previewUrl, thumbnailUrl, prompt, generationMetadata, isLowDetail, hideImages, priority}: Props) {
  if (hideImages) {
      return (
          <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100/95 text-slate-500 dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-400">
              <div className="text-xs font-semibold uppercase tracking-[0.16em]">图片已隐藏</div>
              <div className="mt-1 text-[10px] opacity-70">关闭“隐图”恢复显示</div>
          </div>
      );
  }
  const metadata = generationMetadata;
  const providerLabel = getProviderLabel(metadata);
  const modelLabel = getModelLabel(metadata);
  const officialOptionChips = getOfficialOptionChips(metadata);
  const taskDebugChips = getTaskDebugChips(metadata);
  const taskDebugSummary = getTaskDebugSummary(metadata);
  const fallbackSummary = metadata?.providerFallbackUsed
      ? (metadata.fallbackReason || '已触发回退')
      : undefined;
  const promptPreview = typeof metadata?.sourcePrompt === 'string' && metadata.sourcePrompt
      ? metadata.sourcePrompt
      : typeof prompt === 'string' && prompt
          ? prompt
          : undefined;
  const isPanorama = metadata?.assetKind === 'panorama';
  const layoutLabel = typeof metadata?.layoutLabel === 'string' && metadata.layoutLabel
      ? metadata.layoutLabel
      : undefined;
  const layoutRole = metadata?.layoutRole === 'character-view'
      ? '三视图'
      : metadata?.layoutRole === 'grid-item'
          ? '宫格'
          : undefined;
  const lineageLabel = metadata?.generatedFromNode
      ? '生成器输出'
      : metadata?.branchedFromCanvasAction && typeof metadata.imageActionLabel === 'string'
          ? metadata.imageActionLabel
          : undefined;
  const generatorRunCount = typeof metadata?.generatorRunCount === 'number'
      ? metadata.generatorRunCount
      : undefined;

  if (isPanorama && !isLowDetail) {
      return (
          <div className="relative h-full w-full overflow-hidden rounded-2xl border border-sky-300/80 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_rgba(15,23,42,0.95)_66%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_48px_rgba(2,6,23,0.32)] dark:border-sky-400/25">
              <PanoramaViewer
                  src={previewUrl || source}
                  alt="Panorama"
                  badge={(
                      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                          720° Panorama
                      </div>
                  )}
                  overlay={(
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/88 via-slate-950/38 to-transparent p-3 text-white">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                              {providerLabel && <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-white/88">{providerLabel}</span>}
                              {modelLabel && <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-white/82">{modelLabel}</span>}
                              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/15 px-2.5 py-1 text-cyan-50">panorama</span>
                          </div>
                          {promptPreview && (
                              <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/82">{promptPreview}</div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/76">
                              {officialOptionChips.map((chip) => (
                                  <span key={chip} className="rounded-full border border-cyan-300/20 bg-cyan-400/15 px-2.5 py-1 text-cyan-50">{chip}</span>
                              ))}
                              {taskDebugChips.map((chip) => (
                                  <span key={chip} className="rounded-full border border-violet-300/20 bg-violet-400/15 px-2.5 py-1 text-violet-50 normal-case tracking-normal">{chip}</span>
                              ))}
                          </div>
                          {taskDebugSummary && (
                              <div className="mt-2 rounded-xl border border-violet-300/20 bg-violet-400/12 px-2.5 py-2 text-[11px] leading-5 text-violet-50 normal-case">{taskDebugSummary}</div>
                          )}
                          {fallbackSummary && (
                              <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/12 px-2.5 py-2 text-[11px] leading-5 text-amber-50">回退说明：{fallbackSummary}</div>
                          )}
                      </div>
                  )}
              />
          </div>
      );
  }

  return (
      <div className="relative w-full h-full overflow-hidden rounded-lg bg-slate-950">
          <CanvasImageMedia
              source={source}
              previewUrl={previewUrl}
              thumbnailUrl={thumbnailUrl}
              lowDetail={isLowDetail}
              priority={priority}
          />
          {layoutLabel && (
              <div className="pointer-events-none absolute left-2.5 top-2.5 z-20 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full border border-white/18 bg-slate-950/68 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_8px_24px_rgba(2,6,23,0.28)] backdrop-blur-md">
                  {layoutRole && <span className="text-white/55">{layoutRole}</span>}
                  <span className="truncate">{layoutLabel}</span>
              </div>
          )}
          {!isLowDetail && lineageLabel && (
              <div className={`pointer-events-none absolute left-2.5 z-20 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-500/22 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-50 shadow-[0_8px_24px_rgba(2,6,23,0.28)] backdrop-blur-md ${layoutLabel ? 'top-10' : 'top-2.5'}`}>
                  <span>{lineageLabel}</span>
                  {generatorRunCount && <span className="text-violet-100/65">#{generatorRunCount}</span>}
              </div>
          )}
          {!isLowDetail && (providerLabel || modelLabel || officialOptionChips.length > 0 || taskDebugChips.length > 0 || taskDebugSummary || fallbackSummary || promptPreview) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/88 via-slate-950/48 to-transparent p-3 text-white">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                      {providerLabel && <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-white/88">{providerLabel}</span>}
                      {modelLabel && <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-white/82">{modelLabel}</span>}
                      {officialOptionChips.map((chip) => (
                          <span key={chip} className="rounded-full border border-cyan-300/20 bg-cyan-400/15 px-2.5 py-1 text-cyan-50">{chip}</span>
                      ))}
                      {taskDebugChips.map((chip) => (
                          <span key={chip} className="rounded-full border border-violet-300/20 bg-violet-400/15 px-2.5 py-1 text-violet-50 normal-case tracking-normal">{chip}</span>
                      ))}
                  </div>
                  {promptPreview && (
                      <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/82">{promptPreview}</div>
                  )}
                  {taskDebugSummary && (
                      <div className="mt-2 rounded-xl border border-violet-300/20 bg-violet-400/12 px-2.5 py-2 text-[11px] leading-5 text-violet-50 normal-case">{taskDebugSummary}</div>
                  )}
                  {fallbackSummary && (
                      <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/12 px-2.5 py-2 text-[11px] leading-5 text-amber-50">回退说明：{fallbackSummary}</div>
                  )}
              </div>
          )}
      </div>
  );
});
