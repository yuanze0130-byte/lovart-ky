import { createHash, randomUUID } from 'crypto';
import { mkdir, rename, stat, writeFile } from 'fs/promises';
import path from 'path';

const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const DEFAULT_ASSET_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), '.local-data', 'canvas-assets');

type SupportedAsset = {
  extension: 'png' | 'jpg' | 'webp' | 'gif' | 'avif' | 'mp4' | 'webm' | 'mov';
  contentType: string;
  kind: 'image' | 'video';
};

function getAssetRoot() {
  const configuredRoot = process.env.CANVAS_ASSET_DIR?.trim();
  if (!configuredRoot) return DEFAULT_ASSET_ROOT;
  return path.isAbsolute(configuredRoot)
    ? path.normalize(configuredRoot)
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredRoot);
}

function getMaxImageBytes() {
  const configured = Number(process.env.CANVAS_ASSET_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_IMAGE_BYTES;
}

function getMaxVideoBytes() {
  const configured = Number(process.env.CANVAS_VIDEO_ASSET_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_VIDEO_BYTES;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function detectAsset(bytes: Uint8Array): SupportedAsset | null {
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extension: 'png', contentType: 'image/png', kind: 'image' };
  }
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) {
    return { extension: 'jpg', contentType: 'image/jpeg', kind: 'image' };
  }
  if (hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38])) {
    return { extension: 'gif', contentType: 'image/gif', kind: 'image' };
  }
  if (
    hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46])
    && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return { extension: 'webp', contentType: 'image/webp', kind: 'image' };
  }

  const fileType = new TextDecoder('ascii').decode(bytes.slice(4, 12));
  if (fileType === 'ftypavif' || fileType === 'ftypavis') {
    return { extension: 'avif', contentType: 'image/avif', kind: 'image' };
  }
  if (fileType.startsWith('ftyp')) {
    const brand = fileType.slice(4, 8).toLowerCase();
    if (brand === 'qt  ') return { extension: 'mov', contentType: 'video/quicktime', kind: 'video' };
    return { extension: 'mp4', contentType: 'video/mp4', kind: 'video' };
  }
  if (hasBytes(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { extension: 'webm', contentType: 'video/webm', kind: 'video' };
  }

  return null;
}

function isMissingFile(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function getCanvasAssetFile(userId: string, fileName: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  if (!/^[0-9a-f]{64}\.(?:png|jpg|webp|gif|avif|mp4|webm|mov)$/i.test(fileName)) return null;

  const root = getAssetRoot();
  const filePath = path.resolve(/* turbopackIgnore: true */ root, userId, fileName);
  if (!filePath.startsWith(`${root}${path.sep}`)) return null;

  return filePath;
}

export async function saveCanvasAsset(userId: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new Error('素材文件为空');

  const asset = detectAsset(bytes);
  if (!asset) throw new Error('仅支持 PNG、JPEG、WebP、GIF、AVIF、MP4、WebM 或 MOV 素材');
  const maxBytes = asset.kind === 'video' ? getMaxVideoBytes() : getMaxImageBytes();
  if (bytes.byteLength > maxBytes) throw new Error(`${asset.kind === 'video' ? '视频' : '图片'}超过服务器允许的大小`);

  const digest = createHash('sha256').update(bytes).digest('hex');
  const fileName = `${digest}.${asset.extension}`;
  const userDirectory = path.join(getAssetRoot(), userId);
  const targetPath = path.join(userDirectory, fileName);

  await mkdir(userDirectory, { recursive: true, mode: 0o755 });

  try {
    await stat(targetPath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;

    const temporaryPath = path.join(userDirectory, `.${fileName}.${randomUUID()}.tmp`);
    await writeFile(temporaryPath, bytes, { mode: 0o644, flag: 'wx' });
    try {
      await rename(temporaryPath, targetPath);
    } catch (renameError) {
      try {
        await stat(targetPath);
      } catch {
        throw renameError;
      }
    }
  }

  return {
    contentType: asset.contentType,
    kind: asset.kind,
    fileName,
    size: bytes.byteLength,
    url: `/media/canvas/${userId}/${fileName}`,
  };
}

export function getCanvasAssetContentType(fileName: string) {
  if (fileName.endsWith('.mp4')) return 'video/mp4';
  if (fileName.endsWith('.webm')) return 'video/webm';
  if (fileName.endsWith('.mov')) return 'video/quicktime';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.webp')) return 'image/webp';
  if (fileName.endsWith('.gif')) return 'image/gif';
  if (fileName.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}
