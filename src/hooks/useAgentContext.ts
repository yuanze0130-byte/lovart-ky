'use client';

import { useMemo } from 'react';
import type { AgentContext } from '@/lib/agent/actions';
import type { CanvasElement } from '@/components/lovart/CanvasArea';

export function useAgentContext(input: {
  page: AgentContext['page'];
  projectId?: string | null;
  selectedIds?: string[];
  elements?: CanvasElement[];
  assetIds?: string[];
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
    } satisfies AgentContext;
  }, [input.assetIds, input.elements, input.page, input.projectId, input.selectedIds]);
}
