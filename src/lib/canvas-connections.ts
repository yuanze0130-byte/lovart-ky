import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { getRegisteredNodePorts, type NodePortDefinition, type NodePortDirection, type NodePortKind } from '@/lib/node-definitions';

export type CanvasPortDirection = NodePortDirection;
export type CanvasPortKind = NodePortKind;
export type CanvasConnectionKind = 'prompt' | 'reference' | 'result' | 'control';

export type CanvasPortDefinition = NodePortDefinition;

export const PORT_COLORS: Record<CanvasPortKind, string> = {
  prompt: '#f59e0b',
  image: '#10b981',
  video: '#8b5cf6',
  any: '#64748b',
};

export function getNodePorts(element: CanvasElement): CanvasPortDefinition[] {
  return getRegisteredNodePorts(element.type);
}

export function getPort(element: CanvasElement, portId?: string) {
  return getNodePorts(element).find((port) => port.id === portId);
}

export function inferLegacyPorts(source: CanvasElement, target: CanvasElement) {
  const sourcePort = getNodePorts(source).find((port) => port.direction === 'output');
  const targetInputs = getNodePorts(target).filter((port) => port.direction === 'input');
  const targetPort = targetInputs.find((port) => sourcePort && (port.kind === sourcePort.kind || port.kind === 'any')) || targetInputs[0];
  return { sourcePort, targetPort };
}

export function canConnectPorts(source: CanvasPortDefinition, target: CanvasPortDefinition) {
  return source.direction === 'output'
    && target.direction === 'input'
    && (source.kind === target.kind || source.kind === 'any' || target.kind === 'any');
}

export function wouldCreateConnectionCycle(elements: CanvasElement[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of elements) {
    if (edge.type !== 'connector' || !edge.connectorFrom || !edge.connectorTo) continue;
    const targets = outgoing.get(edge.connectorFrom) || [];
    targets.push(edge.connectorTo);
    outgoing.set(edge.connectorFrom, targets);
  }

  const pending = [targetId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (current === sourceId) return true;
    visited.add(current);
    pending.push(...(outgoing.get(current) || []));
  }
  return false;
}

export function connectionKindForPorts(source: CanvasPortDefinition, target: CanvasPortDefinition): CanvasConnectionKind {
  if (source.kind === 'prompt') return 'prompt';
  if (target.id === 'reference-in' || target.id === 'first-frame-in' || target.id === 'last-frame-in') return 'reference';
  return 'result';
}

export function getPortAnchor(element: CanvasElement, portId: string | undefined, direction: CanvasPortDirection) {
  const ports = getNodePorts(element).filter((port) => port.direction === direction);
  const index = Math.max(0, ports.findIndex((port) => port.id === portId));
  const height = element.height || 120;
  return {
    x: direction === 'input' ? element.x : element.x + (element.width || 160),
    y: element.y + (height * (index + 1)) / (ports.length + 1),
  };
}

export function normalizeCanvasConnections(elements: CanvasElement[]) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  return elements.map((element) => {
    if (element.type !== 'connector' || !element.connectorFrom || !element.connectorTo) return element;
    const source = byId.get(element.connectorFrom);
    const target = byId.get(element.connectorTo);
    if (!source || !target) return element;
    const inferred = inferLegacyPorts(source, target);
    return {
      ...element,
      connectorSourcePort: element.connectorSourcePort || inferred.sourcePort?.id,
      connectorTargetPort: element.connectorTargetPort || inferred.targetPort?.id,
      connectorDataKind: element.connectorDataKind || inferred.sourcePort?.kind || 'any',
      connectorKind: element.connectorKind || (inferred.sourcePort && inferred.targetPort
        ? connectionKindForPorts(inferred.sourcePort, inferred.targetPort)
        : 'control'),
    };
  });
}

export function resolveConnectedInputs(targetId: string, elements: CanvasElement[]) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const edges = normalizeCanvasConnections(elements)
    .filter((element) => element.type === 'connector' && element.connectorTo === targetId)
    .sort((a, b) => (a.connectorOrder || 0) - (b.connectorOrder || 0));
  const promptParts: string[] = [];
  const references: string[] = [];
  let firstFrame: string | undefined;
  let lastFrame: string | undefined;

  for (const edge of edges) {
    if (!edge.connectorFrom) continue;
    const source = byId.get(edge.connectorFrom);
    if (!source) continue;
    const value = typeof source.content === 'string' ? source.content : typeof source.prompt === 'string' ? source.prompt : '';
    if (!value) continue;
    if (edge.connectorTargetPort === 'prompt-in') promptParts.push(value);
    else if (edge.connectorTargetPort === 'first-frame-in') firstFrame = value;
    else if (edge.connectorTargetPort === 'last-frame-in') lastFrame = value;
    else if (edge.connectorTargetPort === 'reference-in') references.push(value);
  }
  return { prompt: promptParts.join('\n\n'), references, firstFrame, lastFrame, edges };
}

export function resolveConnectedNodeContents(targetId: string, targetPortId: string, elements: CanvasElement[]) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  return normalizeCanvasConnections(elements)
    .filter((element) => element.type === 'connector'
      && element.connectorTo === targetId
      && element.connectorTargetPort === targetPortId)
    .sort((a, b) => (a.connectorOrder || 0) - (b.connectorOrder || 0))
    .map((edge) => edge.connectorFrom ? byId.get(edge.connectorFrom) : undefined)
    .map((source) => source && typeof source.content === 'string' ? source.content : '')
    .filter(Boolean);
}
