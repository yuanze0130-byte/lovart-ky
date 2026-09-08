'use client';

import type { CanvasElement } from './CanvasArea';
import { CanvasAiControls } from './CanvasAiControls';

interface Props {
  element: CanvasElement;
  source: string;
  images: string[];
  video?: string;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onRunningChange: (running: boolean) => void;
}

export function AiTextNode({ element, source, images, video, onConfigChange, onRunningChange }: Props) {
  return <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/15 bg-[#1d1d20] text-white shadow-xl" onWheel={(event) => event.stopPropagation()}>
    <div className="px-3 py-2 text-xs font-semibold">{element.type === 'ai-agent' ? 'Agent 节点' : 'AI 文本'}<span className="ml-2 font-normal text-white/40">文字输出 → 下游提示词</span></div>
    <CanvasAiControls mode={element.type === 'ai-agent' ? 'agent' : 'text'} model={element.aiModel} instruction={element.aiInstruction} systemPrompt={element.aiSystemPrompt} source={source} images={images} video={video} outputKey={element.content}
      onConfigChange={onConfigChange} onRunningChange={onRunningChange} onResult={(result) => onConfigChange({ content: result.text })} />
    <textarea aria-label="AI 输出文字" className="min-h-20 flex-1 resize-none bg-transparent p-3 text-xs leading-6 outline-none" value={element.content || ''} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => onConfigChange({ content: event.target.value })} placeholder="生成结果显示在这里，也可以手动编辑。输入要求在上方填写。" />
  </div>;
}
