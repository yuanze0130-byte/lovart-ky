import { authedFetch } from '@/lib/authed-fetch';
import { persistCanvasElementAssets } from '@/lib/canvas-asset-upload';
import { persistentAgentRetry } from '@/lib/agent/retry-session';
import { readCanvasPackage } from '@/lib/canvas-package';

export async function importCanvasPackage(owner: string, text: string) {
  const pack = await readCanvasPackage(JSON.parse(text));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hash = Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
  // Keep the reservation after success so a lost response/reopened tab cannot create a second project.
  const id = await persistentAgentRetry(`canvas-package-import:v1:${owner}:${hash}`);
  const lookup = () => authedFetch(`/api/projects/document?id=${id}`);
  const existing = await lookup();
  if (existing.ok) return {id, reused:true};
  if (existing.status !== 404) throw new Error('无法确认此前的导入结果，请稍后重试');
  const elements = await persistCanvasElementAssets(pack.elements);
  const response = await authedFetch('/api/projects/document', {method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,revision:-1,title:pack.title,elements,viewport:pack.viewport})});
  if (response.status === 409) {
    const recovered = await lookup();
    if (recovered.ok) return {id,reused:true};
  }
  if (!response.ok) throw new Error('新项目保存失败，请保留项目包并重试');
  return {id,reused:false};
}
