import type { CanvasElement } from '@/components/lovart/CanvasArea';

const STORYBOARD_ONLY_FIELDS: Array<keyof CanvasElement> = [
  'storyboardItemId',
  'storyboardShotLabel',
  'storyboardTitle',
  'storyboardMeta',
  'storyboardBrief',
  'storyboardAspectRatio',
  'storyboardVideoSize',
  'storyboardOrientation',
  'storyboardSourceAspectRatio',
  'storyboardSourceVideoSize',
  'storyboardSourceOrientation',
  'storyboardRenderProfile',
  'storyboardDurationSec',
  'storyboardShotIndex',
  'storyboardShotCount',
  'storyboardSequenceState',
  'storyboardSequenceHint',
  'storyboard序列State',
  'storyboard序列Hint',
  'storyboardBoardMode',
  'storyboardElementRole',
  'storyboardLaneOrientation',
];

export function getSelectionWithConnections(elements: CanvasElement[], selectedNodeIds: string[]) {
  const selectedIdSet = new Set(selectedNodeIds);
  return elements.filter((element) => (
    selectedIdSet.has(element.id)
    || (element.type === 'connector'
      && Boolean(element.connectorFrom && selectedIdSet.has(element.connectorFrom))
      && Boolean(element.connectorTo && selectedIdSet.has(element.connectorTo)))
  ));
}

export function duplicateCanvasSelection(
  elements: CanvasElement[],
  selectedNodeIds: string[],
  createId: () => string,
  offset = 24,
) {
  const source = getSelectionWithConnections(elements, selectedNodeIds);
  const idMap = new Map(source.map((element) => [element.id, createId()]));
  const groupIdMap = new Map<string, string>();

  const duplicatedElements = source.map((element) => {
    if (element.groupId && !groupIdMap.has(element.groupId)) {
      groupIdMap.set(element.groupId, createId());
    }

    const duplicate: CanvasElement = {
      ...element,
      id: idMap.get(element.id)!,
      x: element.type === 'connector' ? element.x : element.x + offset,
      y: element.type === 'connector' ? element.y : element.y + offset,
      referenceImageId: element.referenceImageId ? idMap.get(element.referenceImageId) || element.referenceImageId : undefined,
      connectorFrom: element.connectorFrom ? idMap.get(element.connectorFrom) || element.connectorFrom : undefined,
      connectorTo: element.connectorTo ? idMap.get(element.connectorTo) || element.connectorTo : undefined,
      linkedElements: element.linkedElements?.map((id) => idMap.get(id) || id),
      groupId: element.groupId ? groupIdMap.get(element.groupId) : undefined,
    };

    STORYBOARD_ONLY_FIELDS.forEach((field) => delete duplicate[field]);
    return duplicate;
  });

  return {
    elements: duplicatedElements,
    selectedIds: selectedNodeIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
  };
}

export function serializeCanvasSelection(elements: CanvasElement[], selectedNodeIds: string[]) {
  const selectedElements = getSelectionWithConnections(elements, selectedNodeIds);
  return JSON.stringify({
    format: 'doodleverse-selection',
    version: 1,
    exportedAt: new Date().toISOString(),
    elements: selectedElements,
  }, null, 2);
}
