export type ImageSubmission = { id: string; index: number; count: number };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validImageSubmission(value: unknown): value is ImageSubmission {
  if (!value || typeof value !== 'object') return false;
  const item = value as ImageSubmission;
  return typeof item.id === 'string' && uuid.test(item.id) && Number.isInteger(item.count)
    && item.count >= 1 && item.count <= 8 && Number.isInteger(item.index) && item.index >= 0 && item.index < item.count;
}

export function imageQueueKey(projectId: string | undefined, requestId: string, generatorId?: string, independent = false) {
  return `${projectId}:${generatorId && !independent ? `node:${generatorId}` : requestId}`;
}

export function imageNodeBusy(nodeId: string, recovery: {ready:boolean;busyNodeIds:string[];runStates:Record<string,string>}, logs:Array<{id:string;kind:string;nodeId?:string;status:string}>) {
  if (!recovery.ready || recovery.busyNodeIds.includes(nodeId)) return true;
  return logs.some(entry => entry.kind === 'image' && entry.nodeId === nodeId
    && ['queued','running','outcome_unknown'].includes(recovery.runStates[entry.id] || entry.status));
}
