'use client';

import { BookOpen, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement, ScriptScene } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { tableToMarkdown } from '@/lib/table-editor';

interface ScriptWriterNodeProps {
  connectedBrief?: string;
  brief: string;
  genre: string;
  durationMinutes: number;
  characters: string;
  title?: string;
  logline?: string;
  scenes: ScriptScene[];
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onRunningChange?: (running: boolean) => void;
}

const GENRES = ['剧情短片', '广告片', '短视频', '纪录片'];

function scriptToMarkdown(title: string, logline: string, characters: string[], scenes: ScriptScene[]) {
  const table = tableToMarkdown(
    ['场次', '地点', '时间', '画面', '动作/剧情', '台词/旁白', '景别/运镜'],
    scenes.map((scene) => [scene.scene, scene.location, scene.time, scene.visual, scene.action, scene.dialogue, scene.shot]),
  );
  return `# ${title}\n\n> ${logline}\n\n## 角色\n${characters.map((character) => `- ${character}`).join('\n')}\n\n## 分场剧本\n\n${table}`;
}

export function ScriptWriterNode({ connectedBrief, brief, genre, durationMinutes, characters, title, logline, scenes, onConfigChange, onRunningChange }: ScriptWriterNodeProps) {
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const runningChangeRef = useRef(onRunningChange);
  const inputKey = JSON.stringify([connectedBrief || '', brief, genre, durationMinutes, characters]);
  const inputKeyRef = useRef(inputKey);
  inputKeyRef.current = inputKey;

  useEffect(() => {
    runningChangeRef.current = onRunningChange;
  }, [onRunningChange]);

  useEffect(() => {
    controllerRef.current?.abort();
  }, [brief, characters, connectedBrief, durationMinutes, genre]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      runningChangeRef.current?.(false);
    };
  }, []);

  const run = async () => {
    const resolvedBrief = connectedBrief?.trim() || brief.trim();
    if (!resolvedBrief || isWriting) return;
    const controller = new AbortController();
    const runInputKey = inputKey;
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsWriting(true);
    runningChangeRef.current?.(true);
    setError(null);
    try {
      let result: { title: string; logline: string; characters: string[]; scenes: ScriptScene[] };
      try {
        const response = await authedFetch('/api/script-writing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ brief: resolvedBrief, genre, durationMinutes, characters }),
        });
        const payload = await response.json() as typeof result & { error?: string; details?: string };
        if (!response.ok || !Array.isArray(payload.scenes)) throw new Error(payload.details || payload.error || '剧本创作失败');
        result = payload;
      } catch (writeError) {
        if (controller.signal.aborted) return;
        result = {
          title: '未命名剧本',
          logline: resolvedBrief.slice(0, 120),
          characters: characters.trim() ? characters.split(/[,，\n]/).filter(Boolean) : ['主角：待补充'],
          scenes: [1, 2, 3].map((index) => ({
            scene: `场 ${index}`,
            location: '待补充',
            time: index === 3 ? '夜' : '日',
            visual: index === 1 ? '建立环境和人物目标' : index === 2 ? '冲突升级，角色开始行动' : '完成转折并收束情绪',
            action: '根据创作要求继续编辑',
            dialogue: '',
            shot: index === 1 ? '全景建立' : index === 2 ? '中景跟随' : '近景收尾',
          })),
        };
        setError(`${writeError instanceof Error ? writeError.message : '智能创作不可用'}，已创建可继续编辑的三幕剧本骨架。`);
      }

      if (controller.signal.aborted || inputKeyRef.current !== runInputKey) return;
      onConfigChange({
        scriptTitle: result.title,
        scriptLogline: result.logline,
        scriptCharacters: result.characters.join('\n'),
        scriptScenes: result.scenes,
        content: scriptToMarkdown(result.title, result.logline, result.characters, result.scenes),
      });
    } catch (runError) {
      if (controller.signal.aborted) return;
      setError(runError instanceof Error ? runError.message : '剧本创作失败');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (mountedRef.current) {
          setIsWriting(false);
          runningChangeRef.current?.(false);
        }
      }
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1d1d20] p-3 text-white shadow-2xl"
      onMouseDown={(event) => { if ((event.target as HTMLElement).closest('button,input,textarea,select')) event.stopPropagation(); }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold"><BookOpen size={13} />剧本创作</div>
          <div className="mt-0.5 text-[10px] text-white/40">大纲 · 角色 · 分场 · 分镜建议</div>
        </div>
        <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-400/10 px-2 py-1 text-[9px] text-fuchsia-100">RHAI</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1">{GENRES.map((item) => (
        <button key={item} type="button" onClick={() => onConfigChange({ scriptGenre: item })} className={`rounded-lg border px-1.5 py-1.5 text-[9px] ${genre === item ? 'border-white bg-white text-black' : 'border-white/10 text-white/55 hover:bg-white/8'}`}>{item}</button>
      ))}</div>

      <div className="mt-3 grid grid-cols-[1fr_92px] gap-2">
        <input value={characters} onChange={(event) => onConfigChange({ scriptCharacters: event.target.value })} placeholder="角色设定，用逗号分隔" className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-white/25" />
        <label className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 text-[10px] text-white/45">
          <input type="number" min={1} max={60} value={durationMinutes} onChange={(event) => onConfigChange({ scriptDurationMinutes: Math.max(1, Number(event.target.value) || 1) })} className="min-w-0 flex-1 bg-transparent text-right text-white outline-none" />分钟
        </label>
      </div>

      <textarea
        value={connectedBrief?.trim() || brief}
        readOnly={Boolean(connectedBrief?.trim())}
        onChange={(event) => onConfigChange({ prompt: event.target.value })}
        placeholder="输入主题、风格、故事目标；也可连接视频拆解或文本节点..."
        className="mt-2 h-20 resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] leading-5 text-white outline-none placeholder:text-white/25"
      />

      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-black/18">
        {scenes.length > 0 ? (
          <div>
            <div className="border-b border-white/10 px-3 py-2"><div className="text-xs font-semibold">{title}</div><div className="mt-1 text-[10px] leading-4 text-white/45">{logline}</div></div>
            <div className="divide-y divide-white/8">{scenes.map((scene, index) => (
              <div key={`${scene.scene}-${index}`} className="px-3 py-2 text-[10px]">
                <div className="flex items-center justify-between"><span className="font-semibold text-fuchsia-200">{scene.scene} · {scene.location} · {scene.time}</span><span className="text-white/35">{scene.shot}</span></div>
                <div className="mt-1 text-white/65">{scene.visual}</div>
                {(scene.action || scene.dialogue) && <div className="mt-1 text-white/35">{scene.action}{scene.dialogue ? ` · ${scene.dialogue}` : ''}</div>}
              </div>
            ))}</div>
          </div>
        ) : <div className="grid h-full min-h-32 place-items-center px-8 text-center text-[10px] leading-5 text-white/30">连接创意大纲、视频拆解或直接输入需求，生成可连线的结构化剧本</div>}
      </div>

      {error && <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4 text-amber-100">{error}</div>}
      <button type="button" onClick={() => void run()} disabled={isWriting || !(connectedBrief?.trim() || brief.trim())} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40">
        {isWriting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {isWriting ? '正在创作剧本...' : scenes.length > 0 ? '重新创作' : '开始剧本创作'}
      </button>
    </div>
  );
}
