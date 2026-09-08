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
