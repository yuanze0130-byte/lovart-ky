import type { CanvasElement } from '@/components/lovart/CanvasArea';

export interface ImageVersionGroup { rootId:string; versions:CanvasElement[] }
export function uniqueImageForContent(elements:CanvasElement[],content:string):CanvasElement|undefined{
  const matches=elements.filter(item=>item.type==='image' && (item.content===content || (Array.isArray(item.imageVersions) && item.imageVersions.some(version=>version && typeof version==='object' && !Array.isArray(version) && version.content===content))));
  return matches.length===1?matches[0]:undefined;
}
export function resolveImageReference(elements:CanvasElement[],id?:string,versionId?:string):CanvasElement|undefined{
  const source=elements.find(item=>item.id===id && item.type==='image');
  if(!source || !versionId)return source;
  try{return selectImageVersion(source,versionId);}catch{return undefined;}
}
export function imageResultContent(element:CanvasElement, requestId:string):string|undefined {
  if(Array.isArray(element.imageVersions))for(const version of element.imageVersions){
    if(!version || typeof version!=='object' || Array.isArray(version))continue;
    const metadata=version.generationMetadata;
    if(version.id===requestId || (metadata && typeof metadata==='object' && !Array.isArray(metadata) && metadata.recoveryRequestId===requestId))return typeof version.content==='string'?version.content:undefined;
  }
  return element.id===requestId || element.generationMetadata?.recoveryRequestId===requestId ? element.content : undefined;
}
export function containsImageResult(element:CanvasElement, requestId:string):boolean {
  if(element.id===requestId || element.generationMetadata?.recoveryRequestId===requestId)return true;
  return Array.isArray(element.imageVersions) && element.imageVersions.some(version=>{
    if(!version || typeof version!=='object' || Array.isArray(version))return false;
    const metadata=version.generationMetadata;
    return version.id===requestId || Boolean(metadata && typeof metadata==='object' && !Array.isArray(metadata) && metadata.recoveryRequestId===requestId);
  });
}
export function isDisplayedImageResult(element:CanvasElement,requestId:string):boolean{
  if(!Array.isArray(element.imageVersions))return containsImageResult(element,requestId);
  const active=element.imageVersions.find(item=>item && typeof item==='object' && !Array.isArray(item) && item.id===element.activeImageVersionId);
  if(!active || typeof active!=='object' || Array.isArray(active))return false;
  const metadata=active.generationMetadata;
  return active.id===requestId || Boolean(metadata && typeof metadata==='object' && !Array.isArray(metadata) && metadata.recoveryRequestId===requestId);
}
/** Group only explicit edit ancestry; shared prompts or image URLs are not identity. */
export function imageVersionGroups(elements:CanvasElement[]):ImageVersionGroup[] {
  const images=new Map(elements.filter(element=>element.type==='image' && element.content).map(element=>[element.id,element]));
  const roots=new Map<string,string>();
  const rootFor=(id:string):string=>{
    if(roots.has(id))return roots.get(id)!;
    const path:string[]=[];let current=id;
    while(true){
      if(roots.has(current)){current=roots.get(current)!;break;}
      const cycle=path.indexOf(current);
      if(cycle>=0){current=path.slice(cycle).sort()[0];break;}
      path.push(current);
      const parent=images.get(current)?.sourceImageId;
      if(typeof parent!=='string' || !images.has(parent))break;
      current=parent;
    }
    for(const member of path)roots.set(member,current);
    return current;
  };
  const groups=new Map<string,CanvasElement[]>();
  for(const image of images.values()){
    const root=rootFor(image.id);
    groups.set(root,[...(groups.get(root)||[]),image]);
  }
  return [...groups].filter(([,versions])=>versions.length>1).map(([rootId,versions])=>({rootId,versions:[images.get(rootId)!,...versions.filter(item=>item.id!==rootId)]}));
}

/** Store every version on one node; original content remains an immutable version. */
export function collectImageVersions(elements:CanvasElement[], rootId:string):CanvasElement[] {
  const group=imageVersionGroups(elements).find(item=>item.rootId===rootId);
  if(!group)throw Error('版本组不存在或来源已变化');
  const members=new Set(group.versions.map(item=>item.id));
  const root=group.versions[0];
  const versions=group.versions.flatMap(item=>Array.isArray(item.imageVersions) ? item.imageVersions : [{
    id:item.id,content:item.content!,prompt:item.prompt || '',generationMetadata:item.generationMetadata || {},
    width:item.width || 400,height:item.height || 400,
    originalWidth:item.originalWidth || item.width || 400,originalHeight:item.originalHeight || item.height || 400,
  }]);
  const ids=new Set<string>();
  for(const version of versions){
    if(!version || typeof version!=='object' || Array.isArray(version) || typeof version.id!=='string' || ids.has(version.id))throw Error('版本记录无效或重复');
    ids.add(version.id);
  }
  const internal=elements.filter(item=>item.type==='connector' && members.has(String(item.connectorFrom)) && members.has(String(item.connectorTo)));
  const internalIds=new Set(internal.map(item=>item.id));
  const next=elements.filter(item=>(!members.has(item.id) || item.id===root.id) && !internalIds.has(item.id)).map(item=>{
    let value:CanvasElement=item.id===root.id?{...root,imageVersions:versions,activeImageVersionId:root.activeImageVersionId || root.id,
      imageVersionInternalConnectors:[...(Array.isArray(root.imageVersionInternalConnectors)?root.imageVersionInternalConnectors:[]),...internal]}:{...item};
    if(item.type==='connector'){
      if(members.has(String(item.connectorFrom)))value={...value,connectorFrom:root.id,connectorFromVersionId:item.connectorFromVersionId || group.versions.find(image=>image.id===item.connectorFrom)?.activeImageVersionId as string || item.connectorFrom};
      if(members.has(String(item.connectorTo)))value={...value,connectorTo:root.id,connectorToVersionId:item.connectorToVersionId || item.connectorTo};
    }
    if(item.referenceImageId && members.has(item.referenceImageId))value={...value,referenceImageId:root.id,referenceImageVersionId:item.referenceImageVersionId || group.versions.find(image=>image.id===item.referenceImageId)?.activeImageVersionId as string || item.referenceImageId};
    if(item.linkedElements)value.linkedElements=[...new Set(item.linkedElements.filter(id=>!internalIds.has(id)).map(id=>members.has(id)?root.id:id))].filter(id=>id!==item.id);
    return value;
  });
  // Convert direct asset references to version-pinned edges so switching the visible version cannot change an existing task's input.
  for(const item of next){
    const refs=item.assetReferenceIds?.filter(id=>members.has(id)) || [];
    if(!refs.length)continue;
    item.assetReferenceIds=item.assetReferenceIds?.filter(id=>!members.has(id));
    for(const [index,id] of refs.entries())next.push({id:`version-ref:${item.id}:${id}`,type:'connector',x:0,y:0,connectorFrom:root.id,connectorTo:item.id,
      connectorFromVersionId:group.versions.find(image=>image.id===id)?.activeImageVersionId as string || id,connectorSourcePort:'image-out',connectorDataKind:'image',connectorKind:'reference',connectorOrder:100000+index});
  }
  return next;
}

export function selectImageVersion(element:CanvasElement, versionId:string):CanvasElement {
  const version=Array.isArray(element.imageVersions)?element.imageVersions.find(item=>item && typeof item==='object' && !Array.isArray(item) && item.id===versionId):undefined;
  if(!version || typeof version!=='object' || Array.isArray(version) || typeof version.content!=='string' || !version.content)throw Error('图片版本不存在');
  return {...element,content:version.content,prompt:typeof version.prompt==='string'?version.prompt:undefined,
    originalWidth:typeof version.originalWidth==='number'?version.originalWidth:typeof version.width==='number'?version.width:undefined,
    originalHeight:typeof version.originalHeight==='number'?version.originalHeight:typeof version.height==='number'?version.height:undefined,
    generationMetadata:version.generationMetadata && typeof version.generationMetadata==='object' && !Array.isArray(version.generationMetadata)?version.generationMetadata:undefined,
    previewUrl:undefined,thumbnailUrl:undefined,activeImageVersionId:versionId};
}
/** In-place edit tools also retain the first image and every later edit. */
export function replaceImageWithVersion(element:CanvasElement,patch:Partial<CanvasElement>,versionId=crypto.randomUUID()):CanvasElement{
  if(element.type!=='image' || !element.content || !patch.content || patch.content===element.content)return {...element,...patch};
  const snapshot=(item:CanvasElement,id:string)=>({id,content:item.content!,prompt:item.prompt || '',generationMetadata:item.generationMetadata || {},
    width:item.width || 400,height:item.height || 400,originalWidth:item.originalWidth || item.width || 400,originalHeight:item.originalHeight || item.height || 400});
  const previous=Array.isArray(element.imageVersions)?element.imageVersions:[snapshot(element,element.id)];
  const id=versionId;
  const next={...element,...patch,imageVersions:[...previous,snapshot({...element,...patch},id)]};
  return selectImageVersion(next,id);
}
/** New edits join their source group automatically; changing visible versions preserves existing inputs. */
export function groupNewImageEdits(previous:CanvasElement[],next:CanvasElement[]):CanvasElement[]{
  const existing=new Set(previous.map(item=>item.id));
  let result=next;
  for(const group of imageVersionGroups(next)){
    const added=group.versions.filter(item=>!existing.has(item.id) && typeof item.sourceImageId==='string');
    if(!existing.has(group.rootId) || !added.length)continue;
    // If a legacy/corrupted group cannot collect, preserve the new nodes so no result is lost.
    try{
      result=collectImageVersions(result,group.rootId).map(item=>item.id===group.rootId?selectImageVersion(item,added[added.length-1].id):item);
    }catch{continue;}
  }
  return result;
}
