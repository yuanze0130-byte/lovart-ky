'use client';

import { useMemo, useState } from 'react';
import type { CanvasElement } from './CanvasArea';

const COLORS = [
  { id: 'F0606B', hex: '#F0606B', name: '红色' },
  { id: 'F4A14B', hex: '#F4A14B', name: '橙色' },
  { id: 'EDC63D', hex: '#EDC63D', name: '黄色' },
  { id: '4FC978', hex: '#4FC978', name: '绿色' },
  { id: '4EA8FF', hex: '#4EA8FF', name: '蓝色' },
  { id: 'A55CF0', hex: '#A55CF0', name: '紫色' },
] as const;

interface Props {
  elements: CanvasElement[];
  selectedIds: string[];
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  onUpdateMany: (changes: Array<{ id: string; newAttrs: Partial<CanvasElement> }>) => void;
  onSelect: (ids: string[]) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
}

export function CanvasPinBar({ elements, selectedIds, scale, viewportWidth, viewportHeight, onUpdateMany, onSelect, onPanChange }: Props) {
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const selected = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return elements.filter((element) => element.type !== 'connector' && selectedSet.has(element.id));
  }, [elements, selectedIds]);
  const groups = useMemo(() => COLORS.flatMap((color) => {
    const nodes = elements.filter((element) => element.type !== 'connector' && element.colorPins?.includes(color.id));
    if (!nodes.length) return [];
    return [{ color, nodes, name: nodes.find((node) => node.colorPinLabels?.[color.id])?.colorPinLabels?.[color.id] || color.name }];
  }), [elements]);
  const activeGroup = groups.find((group) => group.color.id === activeColor);

  if (!selected.length && !groups.length) return null;

  const toggleColor = (colorId: string) => {
    const allMarked = selected.every((node) => node.colorPins?.includes(colorId));
    const groupName = groups.find((group) => group.color.id === colorId)?.name;
    onUpdateMany(selected.map((node) => {
      const pins = new Set(node.colorPins || []);
      if (allMarked) pins.delete(colorId);
      else pins.add(colorId);
      const labels = { ...node.colorPinLabels };
      if (allMarked) delete labels[colorId];
      else if (groupName) labels[colorId] = groupName;
      return { id: node.id, newAttrs: { colorPins: [...pins], colorPinLabels: labels } };
    }));
  };

  const renameGroup = () => {
    if (!activeGroup) return;
    const name = draftName.trim().slice(0, 24) || activeGroup.color.name;
    onUpdateMany(activeGroup.nodes.map((node) => ({
      id: node.id,
      newAttrs: { colorPinLabels: { ...node.colorPinLabels, [activeGroup.color.id]: name } },
    })));
  };

  const locate = (node: CanvasElement) => {
    onSelect([node.id]);
    onPanChange({
      x: viewportWidth / 2 - (node.x + (node.width || 240) / 2) * scale,
      y: viewportHeight / 2 - (node.y + (node.height || 180) / 2) * scale,
    });
    setActiveColor(null);
  };

  return <div className="pointer-events-auto absolute left-1/2 top-3 z-[135] flex max-w-[min(90vw,760px)] -translate-x-1/2 flex-col items-center gap-2" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-slate-950/85 px-2.5 py-1.5 text-white shadow-xl backdrop-blur-xl">
      {selected.length > 0 && <>
        <span className="px-1 text-[11px] text-white/70">标记 {selected.length} 项</span>
        {COLORS.map((color) => {
          const allMarked = selected.every((node) => node.colorPins?.includes(color.id));
          return <button key={color.id} type="button" title={`${allMarked ? '移除' : '添加'}${color.name}标签`} aria-label={`${allMarked ? '移除' : '添加'}${color.name}标签`} aria-pressed={allMarked}
            onClick={() => toggleColor(color.id)} className={`flex h-7 w-7 items-center justify-center rounded-lg border ${allMarked ? 'border-white bg-white/20' : 'border-transparent hover:bg-white/10'}`}>
            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: color.hex }} />
          </button>;
        })}
        {groups.length > 0 && <span className="mx-1 h-5 w-px bg-white/20" />}
      </>}
      {groups.map((group) => <button key={group.color.id} type="button" title={`${group.name} · ${group.nodes.length} 个节点`} aria-expanded={activeColor === group.color.id}
        onClick={() => { setActiveColor((current) => current === group.color.id ? null : group.color.id); setDraftName(group.name); }}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${activeColor === group.color.id ? 'bg-white/20' : 'hover:bg-white/10'}`}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color.hex }} />{group.name}<span className="text-white/50">{group.nodes.length}</span>
      </button>)}
    </div>
    {activeGroup && <div className="w-72 rounded-xl border border-white/15 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
      <label className="mb-2 block text-[11px] text-white/60" htmlFor="canvas-pin-name">标签名称</label>
      <input id="canvas-pin-name" value={draftName} maxLength={24} onChange={(event) => setDraftName(event.target.value)} onBlur={renameGroup}
        onKeyDown={(event) => { if (event.key === 'Enter') { renameGroup(); event.currentTarget.blur(); } }}
        className="mb-2 w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs outline-none focus:border-sky-400" />
      <div className="max-h-56 space-y-1 overflow-y-auto">{activeGroup.nodes.map((node) => <button key={node.id} type="button" onClick={() => locate(node)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-white/10">
        <span className="min-w-0 flex-1 truncate">{node.annotationLabel || node.storyboardTitle || node.prompt?.slice(0, 36) || node.type}</span>
        <span className="text-[10px] text-white/45">定位</span>
      </button>)}</div>
    </div>}
  </div>;
}
