'use client';

import { useMemo } from 'react';
import type { AgentContext } from '@/lib/agent/actions';
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
    const selectedElementId = input.selectedIds?.[0] || null;
    const selectedElement = input.elements?.find((element) => element.id === selectedElementId);
    const selectedImage = selectedElement?.type === 'image' && typeof selectedElement.content === 'string'
      ? selectedElement.content
      : null;

    return {
      page: input.page,
      projectId: input.projectId || null,
      selectedElementId,
      assetIds: input.assetIds || [],
      selectedImage,
      selectedObject: input.selectedObject || null,
      selectedStoryboardItemId: input.selectedStoryboardItemId || null,
      storyboardCount: input.storyboardCount || 0,
      storyboardItems: input.storyboardItems || [],
    } satisfies AgentContext;
  }, [input.assetIds, input.elements, input.page, input.projectId, input.selectedIds, input.selectedObject, input.selectedStoryboardItemId, input.storyboardCount, input.storyboardItems]);
}
