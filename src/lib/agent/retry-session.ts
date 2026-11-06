import type { AgentContext, AgentMode, AgentImagePlan } from './actions';

function stableMedia(value: string | null | undefined) {
  if (!value) return value;
  try {
    const url = new URL(value, 'https://canvas.invalid');
    if (['canvas.invalid', 'doodleverse.cn', 'www.doodleverse.cn'].includes(url.hostname) && url.pathname.startsWith('/media/canvas/')) {
      url.searchParams.delete('e');
      url.searchParams.delete('s');
      return `${url.pathname}${url.search}`;
    }
  } catch { /* Inline image data and other inputs retain their exact identity. */ }
  return value;
}

// Only a hash and random run ID are persisted; never prompts or reference images.
export async function agentRetryKey(owner: string, message: string, context: AgentContext, mode?: AgentMode, imagePlan?:AgentImagePlan) {
  const fingerprint = JSON.stringify({message, imagePlan, context:{...context, assetIds:undefined,
    imageReferences:context.imageReferences?.map(ref=>({...ref,url:stableMedia(ref.url)})),
    selectedImage:stableMedia(context.selectedImage),
    storyboardItems:context.storyboardItems?.map(item=>({...item,thumbnailUrl:stableMedia(item.thumbnailUrl)})),
    selectedObject:context.selectedObject ? {...context.selectedObject,maskUrl:stableMedia(context.selectedObject.maskUrl)} : context.selectedObject,
  }, mode});
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  const hash = Array.from(new Uint8Array(bytes), byte=>byte.toString(16).padStart(2,'0')).join('');
  return `canvas-agent-retry:v1:${owner}:${context.projectId || 'none'}:${hash}`;
}

export async function persistentAgentRetry(key: string, releaseId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('doodleverse-agent-retries', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('runs');
    request.onerror = () => reject(new Error('无法保存任务恢复记录，未开始执行'));
    request.onblocked = () => reject(new Error('任务恢复存储被占用，请关闭旧页面后重试'));
    request.onsuccess = () => {
      const db = request.result;
      // Read/write transactions serialize acquisition across tabs.
      const tx = db.transaction('runs', 'readwrite');
      const store = tx.objectStore('runs');
      let id = '';
      let invalid = false;
      const read = store.get(key);
      read.onsuccess = () => {
        const existing: unknown = read.result;
        if (releaseId) {
          if (existing === releaseId) store.delete(key);
          id = releaseId;
          return;
        }
        if (existing !== undefined && (typeof existing !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing))) {
          invalid = true;
          tx.abort();
          return;
        }
        id = existing as string || crypto.randomUUID();
        if (!existing) store.put(id, key);
      };
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onabort = () => { db.close(); reject(new Error(invalid ? '任务恢复记录无效，请先核对任务记录，避免重复提交' : '任务恢复记录未能保存，未开始执行')); };
      tx.onerror = () => { /* onabort handles request failures after rollback. */ };
    };
  });
}

