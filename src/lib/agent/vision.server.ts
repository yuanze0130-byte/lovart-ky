import { readFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import type { AgentContext } from './actions';
import { parseCanvasAssetPath } from '@/lib/canvas-asset-access';
import { getCanvasAssetFile } from '@/lib/canvas-asset-server';

// Resolve only owned local media. Never fetch a user-provided network address.
export async function agentVisionFiles(context: AgentContext, userId: string) {
  const inputs = context.referenceId || !context.imageReferences?.some(r => r.source === 'selection')
    ? context.selectedImage ? [context.selectedImage] : []
    : context.imageReferences.filter(r => r.source === 'selection').map(r => r.url);
  const unique = [...new Set(inputs)];
  if (unique.length > 4) throw new Error('一次最多分析 4 张图片，请缩小选区');
  return Promise.all(unique.map(async url => {
    const asset = parseCanvasAssetPath(url);
    if (!asset || asset.userId !== userId || !/\.(png|jpg|webp|gif|avif)$/i.test(asset.fileName)) throw new Error('图片尚未保存到当前账号，请先保存项目后重试');
    const file = getCanvasAssetFile(userId,asset.fileName);
    if (!file) throw new Error('图片路径无效');
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size > 20*1024*1024) throw new Error('图片无法读取或超过 20 MB，请重新上传');
    return file;
  }));
}

export async function loadAgentVisionImages(files: string[]) {
  const images:string[]=[];
  // Decode one image at a time to bound memory on the production server.
  for (const file of files) {
    const bytes = await readFile(file);
    if (bytes.length > 20*1024*1024) throw new Error('图片过大');
    const image = await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
    images.push(`data:image/jpeg;base64,${image.toString('base64')}`);
  }
  return images;
}
