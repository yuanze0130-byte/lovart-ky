import type { GenerationHistoryItem } from './generation-history';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function generationProvenance(item:GenerationHistoryItem,currentProjectId?:string|null,ownerId?:string){
  const legacyProject=item.metadata?.projectId;
  const projectId=item.origin?.projectId || (typeof legacyProject==='string'?legacyProject:undefined);
  const sourceId=item.origin?.sourceNodeId || (typeof item.metadata?.generatorElementId==='string'?item.metadata.generatorElementId:undefined);
  const nodeId=item.origin?.nodeId || item.id;
  const knownOwner=item.origin?.ownerId || (typeof item.metadata?.ownerId==='string'?item.metadata.ownerId:undefined);
  const allowed=!knownOwner || knownOwner===ownerId;
  const sameProject=Boolean(projectId && projectId===currentProjectId);
  const focus=sourceId || nodeId;
  const href=allowed && projectId && uuid.test(projectId) ? `/canvas?id=${encodeURIComponent(projectId)}&focusNode=${encodeURIComponent(focus.slice(0,200))}` : undefined;
  return {allowed,projectId,nodeId,sourceId,sameProject,href,projectLabel:item.origin?.projectTitle || projectId};
}
