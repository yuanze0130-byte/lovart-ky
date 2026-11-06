import type { CanvasElement } from '@/components/lovart/CanvasArea';
const LIMIT = 50 * 1024 * 1024;
export const CANVAS_PACKAGE_FILE_LIMIT = 75 * 1024 * 1024;
type Asset = { id: string; data: string; bytes: number };
export type CanvasPackage = { format: 'doodleverse-package'; version: 1; title: string; elements: CanvasElement[]; viewport?: {x:number;y:number;scale:number}; assets: Asset[] };
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), b=>b.toString(16).padStart(2,'0')).join('');
// User-authored text can itself be a URL. Keep it literal on both export and import.
const TEXT_FIELDS = new Set(['prompt', 'initialPrompt', 'aiInstruction', 'aiSystemPrompt', 'title', 'label', 'description', 'storyboardBrief', 'storyboardMeta', 'storyboardSequenceHint', 'tableRows', 'tableColumns', 'tableMarkdown', 'scriptLogline', 'scriptCharacters', 'videoBreakdownSummary']);
const TEXT_CONTENT_TYPES = new Set(['text', 'ai-text', 'ai-agent', 'shape', 'table-editor', 'script-writer']);
async function walk(value: unknown, transform: (s:string)=>Promise<string>, depth=0): Promise<unknown> {
  if (depth>40) throw new Error('项目数据嵌套过深');
  if(typeof value==='string') return transform(value);
  if(Array.isArray(value)) { const result=[]; for(const entry of value) result.push(await walk(entry,transform,depth+1)); return result; }
  if(value && typeof value==='object') {
    const entries=[];
    const type = (value as Record<string, unknown>).type;
    for(const [key,entry] of Object.entries(value)) {
      const literal = TEXT_FIELDS.has(key) || ((key === 'content' || key === 'previousContent') && typeof type === 'string' && TEXT_CONTENT_TYPES.has(type));
      entries.push([key,await walk(entry,literal ? async text => text : transform,depth+1)]);
    }
    return Object.fromEntries(entries);
  }
  return value;
}
function validate(elements: unknown): asserts elements is CanvasElement[] {
  if(!Array.isArray(elements)||elements.length>5000) throw new Error('项目元素列表无效或超过 5000 个');
  const ids=new Set<string>();
  for(const e of elements) {
    if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.type!=='string'||!Number.isFinite(e.x)||!Number.isFinite(e.y)) throw new Error('节点编号重复或节点数据无效');
    ids.add(e.id);
  }
  for(const e of elements) if(e.type==='connector'&&(!ids.has(e.connectorFrom)||!ids.has(e.connectorTo))) throw new Error('项目存在缺失端点的连线');
}
function validateViewport(viewport: CanvasPackage['viewport']) {
  if (viewport !== undefined && (!viewport || !Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.scale) || viewport.scale <= 0)) {
    throw new Error('项目视角无效');
  }
}
export function serializeCanvasPackage(pack: CanvasPackage): string {
  const json = JSON.stringify(pack);
  if (new TextEncoder().encode(json).byteLength > CANVAS_PACKAGE_FILE_LIMIT) throw new Error('完整项目包超过 75 MB，请拆分项目');
  return json;
}
export async function createCanvasPackage(input: Omit<CanvasPackage,'format'|'version'|'assets'>): Promise<CanvasPackage> {
  validate(input.elements);
  validateViewport(input.viewport);
  const assets=new Map<string,Asset>(), cache=new Map<string,string>();let total=0;
  const elements=await walk(input.elements,async source=>{
    if(!/^(?:https?:\/\/|\/media\/canvas\/|blob:|data:(?:image|audio|video)\/)/i.test(source)) return source;
    if(cache.has(source)) return cache.get(source)!;
    const response=await fetch(source,{signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error('素材读取失败，未生成项目包');
    const type=response.headers.get('content-type')?.split(';')[0]||'';
    if(!/^(image|audio|video)\//.test(type)) throw new Error('项目包含无法确认为媒体的链接，请核对素材');
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>LIMIT-total) throw new Error('素材包超过 50 MB，请拆分项目');
    const reader=response.body?.getReader();if(!reader) throw new Error('无法读取素材');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(total+size>LIMIT){await reader.cancel();throw new Error('素材包超过 50 MB，请拆分项目');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const id=await digest(bytes);
    if(!assets.has(id)){let binary='';for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));assets.set(id,{id,data:`data:${type};base64,${btoa(binary)}`,bytes:size});total+=size;}
    const ref=`doodle-asset:${id}`;cache.set(source,ref);return ref;
  }) as CanvasElement[];
  return { ...input,format:'doodleverse-package',version:1,elements,assets:[...assets.values()] };
}
export async function readCanvasPackage(input: unknown) {
  const data=input as CanvasPackage;
  if(!data||data.format!=='doodleverse-package'||data.version!==1||typeof data.title!=='string'||data.title.length>500||!Array.isArray(data.assets)) throw new Error('项目包格式无效');
  validate(data.elements);
  validateViewport(data.viewport);
  const assets=new Map<string,string>();let total=0;
  for(const asset of data.assets){
    if(!asset||typeof asset.data!=='string'||!/^data:(image|audio|video)\/[\w.+-]+;base64,/.test(asset.data)||assets.has(asset.id)) throw new Error('素材格式无效或重复');
    const encoded=asset.data.slice(asset.data.indexOf(',')+1);if(encoded.length>Math.ceil(LIMIT*4/3)) throw new Error('素材过大');
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));total+=bytes.length;
    if(total>LIMIT||asset.bytes!==bytes.length||asset.id!==await digest(bytes)) throw new Error('素材完整性校验失败');
    assets.set(asset.id,asset.data);
  }
  const used=new Set<string>();
  const elements=await walk(data.elements,async value=>{if(!value.startsWith('doodle-asset:')) {if(/^(?:https?:\/\/|\/media\/canvas\/|blob:|data:(?:image|audio|video)\/)/i.test(value))throw new Error('项目包存在未嵌入的素材链接');return value;}const id=value.slice(13);const asset=assets.get(id);if(!asset)throw new Error('项目包缺失素材');used.add(id);return asset;}) as CanvasElement[];
  if(used.size!==assets.size) throw new Error('素材清单与项目引用不一致');
  for (const element of elements) {
    delete element.taskId;
    if ('isGenerating' in element) element.isGenerating = false;
    if (element.generationMetadata) {
      delete element.generationMetadata.recoveryRequestId;
      delete element.generationMetadata.taskId;
    }
  }
  return {title:data.title,elements,viewport:data.viewport,assetCount:used.size};
}
