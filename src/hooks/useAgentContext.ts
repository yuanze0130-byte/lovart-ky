'use client';

import { useMemo } from 'react';
import type { AgentContext, AgentImageReference } from '@/lib/agent/actions';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { AnnotationObject } from '@/lib/object-annotation';

export function useAgentContext(input: {
  page: AgentContext['page'];
  projectId?: string | null;
  selectedIds?: string[];
  elements?: CanvasElement[];
  assetIds?: string[];
  selectedObject?: AnnotationObject | null;
  selectedStoryboardItemId?: string | null;
  storyboardCount?: number;
  storyboardItems?: AgentContext['storyboardItems'];
}): AgentContext {
  return useMemo(() => {
    const selected = (input.selectedIds || []).map(id => input.elements?.find(e => e.id === id)).filter((e): e is CanvasElement => Boolean(e));
    const selectedElementId = selected.find(e => e.type === 'image' && typeof e.content === 'string')?.id || selected[0]?.id || null;
    const selectedElement = input.elements?.find((element) => element.id === selectedElementId);
    const selectedImage = selectedElement?.type === 'image' && typeof selectedElement.content === 'string'
      ? selectedElement.content
      : null;
    const images = (input.elements || []).filter(e=>e.type==='image' && typeof e.content==='string');
    const selectedImages = images.filter(e=>input.selectedIds?.includes(e.id));
    const lastBatch = images.findLast(e=>typeof e.agentBatchId==='string')?.agentBatchId;
    const candidates = selectedImages.length ? selectedImages : lastBatch ? images.filter(e=>e.agentBatchId===lastBatch) : [];
    const imageReferences:AgentImageReference[] = candidates.slice(0,50).map((e,index)=>({id:e.id,url:e.content as string,
      label:String(e.prompt || '图片').slice(0,200),ordinal:selectedImages.length?index+1:Number(e.agentStep || index+1),source:selectedImages.length?'selection':'result'}));

    return {
      page: input.page,
      projectId: input.projectId || null,
      selectedElementId,
      scope: selected.length ? 'selection' : 'project',
      selectedElements: selected.slice(0, 50).map(e => ({ id: e.id, type: e.type, label: e.type === 'text' ? String(e.content || '').slice(0, 200) : String(e.prompt || '').slice(0, 200) })),
      assetIds: input.assetIds || [],
      selectedImage,
      imageReferences,
      selectedObject: input.selectedObject || null,
      selectedStoryboardItemId: input.selectedStoryboardItemId || null,
      storyboardCount: input.storyboardCount || 0,
      storyboardItems: input.storyboardItems || [],
    } satisfies AgentContext;
  }, [input.assetIds, input.elements, input.page, input.projectId, input.selectedIds, input.selectedObject, input.selectedStoryboardItemId, input.storyboardCount, input.storyboardItems]);
}
