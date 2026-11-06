export type CanvasReferenceAssetKind = 'text' | 'image' | 'video' | 'audio';
export interface CanvasReferenceAsset {
  id: string;
  kind: CanvasReferenceAssetKind;
  label: string;
  content: string;
  previewUrl?: string;
  groupId?: string;
}

export function availableCanvasReferences(assets: CanvasReferenceAsset[], targetId: string, kinds: CanvasReferenceAssetKind[]) {
  return assets.filter(asset => asset.id !== targetId && kinds.includes(asset.kind) && Boolean(asset.content.trim()));
}

/** Snapshot the currently eligible members into the existing per-node reference IDs.
 * Later regrouping cannot silently alter a prepared generation request. */
export function canvasReferenceGroups(assets: CanvasReferenceAsset[], targetId: string, kinds: CanvasReferenceAssetKind[]) {
  const groups = new Map<string, { id: string; label: string; memberIds: string[] }>();
  for (const asset of availableCanvasReferences(assets, targetId, kinds)) {
    if (!asset.groupId) continue;
    let group = groups.get(asset.groupId);
    if (!group) { group = { id: asset.groupId, label: `分组 · ${asset.label}`, memberIds: [] }; groups.set(asset.groupId, group); }
    if (!group.memberIds.includes(asset.id)) group.memberIds.push(asset.id);
  }
  return [...groups.values()];
}

export function addCanvasGroupReferences(selectedIds: string[], memberIds: string[]) {
  return [...new Set([...selectedIds, ...memberIds])];
}

export function replaceCanvasAssetReference(selectedIds: string[], sourceId: string, targetId: string) {
  const replaced: string[] = [];
  let foundSource = false;

  for (const id of selectedIds) {
    const nextId = id === sourceId ? targetId : id;
    if (id === sourceId) foundSource = true;
    if (nextId && !replaced.includes(nextId)) replaced.push(nextId);
  }

  if (!foundSource && targetId && !replaced.includes(targetId)) replaced.push(targetId);
  return replaced;
}
