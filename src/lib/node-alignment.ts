import type { CanvasElement } from '@/components/lovart/CanvasArea';

export type NodeAlignmentAction =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'distribute-horizontal-top'
  | 'distribute-horizontal-center'
  | 'distribute-horizontal-bottom'
  | 'distribute-vertical-left'
  | 'distribute-vertical-center'
  | 'distribute-vertical-right';

type LayoutNode = CanvasElement & { width: number; height: number };

const DEFAULT_NODE_DIMENSIONS: Partial<Record<CanvasElement['type'], { width: number; height: number }>> = {
  text: { width: 240, height: 100 },
  'image-generator': { width: 400, height: 400 },
  'video-generator': { width: 400, height: 300 },
  'image-compare': { width: 420, height: 300 },
  'global-view': { width: 420, height: 390 },
  'motion-transfer': { width: 420, height: 580 },
  'table-editor': { width: 520, height: 430 },
  'video-frames': { width: 440, height: 500 },
  'video-breakdown': { width: 440, height: 540 },
  'script-writer': { width: 460, height: 600 },
  inpaint: { width: 440, height: 360 },
};

const withDimensions = (element: CanvasElement): LayoutNode => {
  const defaults = DEFAULT_NODE_DIMENSIONS[element.type];
  return {
    ...element,
    width: element.width || defaults?.width || 120,
    height: element.height || defaults?.height || 120,
  };
};

function alignAxis(nodes: LayoutNode[], action: NodeAlignmentAction) {
  const left = Math.min(...nodes.map((node) => node.x));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const top = Math.min(...nodes.map((node) => node.y));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  return nodes.map((node) => {
    if (action === 'left') return { ...node, x: left };
    if (action === 'horizontal-center') return { ...node, x: centerX - node.width / 2 };
    if (action === 'right') return { ...node, x: right - node.width };
    if (action === 'top') return { ...node, y: top };
    if (action === 'vertical-center') return { ...node, y: centerY - node.height / 2 };
    if (action === 'bottom') return { ...node, y: bottom - node.height };
    return node;
  });
}

function distribute(nodes: LayoutNode[], direction: 'horizontal' | 'vertical') {
  if (nodes.length < 3) return nodes;
  const sorted = [...nodes].sort((first, second) => direction === 'horizontal' ? first.x - second.x : first.y - second.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSize = sorted.reduce((sum, node) => sum + (direction === 'horizontal' ? node.width : node.height), 0);
  const span = direction === 'horizontal'
    ? last.x + last.width - first.x
    : last.y + last.height - first.y;
  const gap = (span - totalSize) / (sorted.length - 1);
  let cursor = direction === 'horizontal' ? first.x : first.y;

  return sorted.map((node) => {
    const next = direction === 'horizontal' ? { ...node, x: cursor } : { ...node, y: cursor };
    cursor += (direction === 'horizontal' ? node.width : node.height) + gap;
    return next;
  });
}

export function alignCanvasElements(
  elements: CanvasElement[],
  selectedIds: string[],
  action: NodeAlignmentAction,
) {
  const selectedSet = new Set(selectedIds);
  const selected = elements
    .filter((element) => element.type !== 'connector' && selectedSet.has(element.id))
    .map(withDimensions);
  if (selected.length < 2) return elements;

  let laidOut = selected;
  if (action === 'distribute-horizontal') laidOut = distribute(selected, 'horizontal');
  else if (action === 'distribute-vertical') laidOut = distribute(selected, 'vertical');
  else if (action.startsWith('distribute-horizontal-')) {
    laidOut = distribute(selected, 'horizontal');
    laidOut = alignAxis(laidOut, action.endsWith('-top') ? 'top' : action.endsWith('-bottom') ? 'bottom' : 'vertical-center');
  } else if (action.startsWith('distribute-vertical-')) {
    laidOut = distribute(selected, 'vertical');
    laidOut = alignAxis(laidOut, action.endsWith('-left') ? 'left' : action.endsWith('-right') ? 'right' : 'horizontal-center');
  } else {
    laidOut = alignAxis(selected, action);
  }

  const byId = new Map(laidOut.map((node) => [node.id, node]));
  return elements.map((element) => {
    const laidOutNode = byId.get(element.id);
    return laidOutNode ? {
      ...element,
      x: laidOutNode.x,
      y: laidOutNode.y,
      width: element.width || laidOutNode.width,
      height: element.height || laidOutNode.height,
    } : element;
  });
}
