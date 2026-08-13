import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const DEFAULT_USER_STORAGE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_WRITES = 2;
const DEFAULT_MAX_CONCURRENT_WRITES_PER_USER = 1;
const DEFAULT_MAX_QUEUED_WRITES = 20;
const SIGNATURE_BYTES = 16;
const DEFAULT_ASSET_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), '.local-data', 'canvas-assets');

export type CanvasAssetKind = 'image' | 'video';

export type SupportedCanvasAsset = {
  extension: 'png' | 'jpg' | 'webp' | 'gif' | 'avif' | 'mp4' | 'webm' | 'mov';
  contentType: string;
  kind: CanvasAssetKind;
};

export type SavedCanvasAsset = {
  contentType: string;
  kind: CanvasAssetKind;
  fileName: string;
  size: number;
  url: string;
};

export type SaveCanvasAssetStreamOptions = {
  declaredBytes?: number;
  expectedKind?: CanvasAssetKind;
  signal?: AbortSignal;
};

type CanvasAssetSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

type WriteWaiter = {
  userId: string;
  signal?: AbortSignal;
  onAbort?: () => void;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
};

type CanvasAssetWriteState = {
  activeGlobal: number;
  activeByUser: Map<string, number>;
  queue: WriteWaiter[];
};

type CanvasAssetGlobal = typeof globalThis & {
  __doodleverseCanvasAssetWriteState?: CanvasAssetWriteState;
};

export class CanvasAssetStorageError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'CanvasAssetStorageError';
  }
}

function getAssetRoot() {
  const configuredRoot = process.env.CANVAS_ASSET_DIR?.trim();
  if (!configuredRoot) return DEFAULT_ASSET_ROOT;
  return path.isAbsolute(configuredRoot)
    ? path.normalize(configuredRoot)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredRoot);
}

function getPositiveInteger(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const configured = Number(process.env[name]);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, maximum)
    : fallback;
}

function getMaxImageBytes() {
  return getPositiveInteger('CANVAS_ASSET_MAX_BYTES', DEFAULT_MAX_IMAGE_BYTES);
}

function getMaxVideoBytes() {
  return getPositiveInteger('CANVAS_VIDEO_ASSET_MAX_BYTES', DEFAULT_MAX_VIDEO_BYTES);
}

function getUserStorageMaxBytes() {
  return getPositiveInteger('CANVAS_USER_STORAGE_MAX_BYTES', DEFAULT_USER_STORAGE_MAX_BYTES);
}

function getWriteLimits() {
  return {
    global: getPositiveInteger('CANVAS_ASSET_MAX_CONCURRENT_WRITES', DEFAULT_MAX_CONCURRENT_WRITES, 16),
    perUser: getPositiveInteger(
      'CANVAS_ASSET_MAX_CONCURRENT_WRITES_PER_USER',
      DEFAULT_MAX_CONCURRENT_WRITES_PER_USER,
      4,
    ),
    queued: getPositiveInteger('CANVAS_ASSET_MAX_QUEUED_WRITES', DEFAULT_MAX_QUEUED_WRITES, 100),
  };
}

function getWriteState() {
  const globalStore = globalThis as CanvasAssetGlobal;
  globalStore.__doodleverseCanvasAssetWriteState ??= {
    activeGlobal: 0,
    activeByUser: new Map<string, number>(),
    queue: [],
  };
  return globalStore.__doodleverseCanvasAssetWriteState;
}

function createCanceledError() {
  return new CanvasAssetStorageError('素材上传已取消', 499);
}

function createRelease(state: CanvasAssetWriteState, userId: string) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.activeGlobal = Math.max(0, state.activeGlobal - 1);
    const activeForUser = Math.max(0, (state.activeByUser.get(userId) ?? 1) - 1);
    if (activeForUser === 0) state.activeByUser.delete(userId);
    else state.activeByUser.set(userId, activeForUser);
    queueMicrotask(drainWriteQueue);
  };
}

function activateWrite(state: CanvasAssetWriteState, userId: string) {
  state.activeGlobal += 1;
  state.activeByUser.set(userId, (state.activeByUser.get(userId) ?? 0) + 1);
  return createRelease(state, userId);
}

function drainWriteQueue() {
  const state = getWriteState();
  const limits = getWriteLimits();
  let index = 0;

  while (state.activeGlobal < limits.global && index < state.queue.length) {
    const waiter = state.queue[index];
    if (waiter.signal?.aborted) {
      state.queue.splice(index, 1);
      waiter.signal.removeEventListener('abort', waiter.onAbort!);
      waiter.reject(createCanceledError());
      continue;
    }
    if ((state.activeByUser.get(waiter.userId) ?? 0) >= limits.perUser) {
      index += 1;
      continue;
    }

    state.queue.splice(index, 1);
    if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
    waiter.resolve(activateWrite(state, waiter.userId));
  }
}

async function acquireWriteSlot(userId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw createCanceledError();

  const state = getWriteState();
  const limits = getWriteLimits();
  if (
    state.activeGlobal < limits.global
    && (state.activeByUser.get(userId) ?? 0) < limits.perUser
  ) {
    return activateWrite(state, userId);
  }
  if (state.queue.length >= limits.queued) {
    throw new CanvasAssetStorageError('素材写入繁忙，请稍后重试', 503, 5);
  }

  return new Promise<() => void>((resolve, reject) => {
    const waiter: WriteWaiter = { userId, signal, resolve, reject };
    waiter.onAbort = () => {
      const index = state.queue.indexOf(waiter);
      if (index >= 0) state.queue.splice(index, 1);
      reject(createCanceledError());
    };
    signal?.addEventListener('abort', waiter.onAbort, { once: true });
    state.queue.push(waiter);
  });
}

async function getDirectoryBytes(directory: string) {
  let entries;
  try {
    entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) return 0;
    throw error;
  }
  const sizes = await Promise.all(entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map(async (entry) => (await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ directory, entry.name))).size));
  return sizes.reduce((total, size) => total + size, 0);
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function getCanvasAssetMaxBytes(kind: CanvasAssetKind) {
  return kind === 'video' ? getMaxVideoBytes() : getMaxImageBytes();
}

export function detectCanvasAsset(bytes: Uint8Array): SupportedCanvasAsset | null {
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

function validateUserId(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new CanvasAssetStorageError('用户标识无效', 400);
  }
}

export function getCanvasAssetFile(userId: string, fileName: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  if (!/^[0-9a-f]{64}\.(?:png|jpg|webp|gif|avif|mp4|webm|mov)$/i.test(fileName)) return null;

  const root = getAssetRoot();
  const filePath = path.resolve(/*turbopackIgnore: true*/ root, userId, fileName);
  if (!filePath.startsWith(`${root}${path.sep}`)) return null;

  return filePath;
}

function isWebReadableStream(source: CanvasAssetSource): source is ReadableStream<Uint8Array> {
  return typeof (source as ReadableStream<Uint8Array>).getReader === 'function';
}

async function* readChunks(source: CanvasAssetSource) {
  if (!isWebReadableStream(source)) {
    for await (const chunk of source) yield chunk;
    return;
  }

  const reader = source.getReader();
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        return;
      }
      yield value;
    }
  } finally {
    if (!completed) await reader.cancel('canvas asset stream stopped').catch(() => undefined);
    reader.releaseLock();
  }
}

function appendSignature(signature: Uint8Array, chunk: Uint8Array) {
  if (signature.byteLength >= SIGNATURE_BYTES) return signature;
  const required = Math.min(SIGNATURE_BYTES - signature.byteLength, chunk.byteLength);
  const next = new Uint8Array(signature.byteLength + required);
  next.set(signature);
  next.set(chunk.subarray(0, required), signature.byteLength);
  return next;
}

function buildSavedAsset(userId: string, fileName: string, size: number, asset: SupportedCanvasAsset): SavedCanvasAsset {
  return {
    contentType: asset.contentType,
    kind: asset.kind,
    fileName,
    size,
    url: `/media/canvas/${userId}/${fileName}`,
  };
}

export async function saveCanvasAssetStream(
  userId: string,
  source: CanvasAssetSource,
  options: SaveCanvasAssetStreamOptions = {},
) {
  validateUserId(userId);
  if (
    options.declaredBytes !== undefined
    && (!Number.isSafeInteger(options.declaredBytes) || options.declaredBytes < 0)
  ) {
    throw new CanvasAssetStorageError('素材大小声明无效', 400);
  }

  const absoluteMaxBytes = Math.max(getMaxImageBytes(), getMaxVideoBytes());
  if (options.declaredBytes !== undefined && options.declaredBytes > absoluteMaxBytes) {
    throw new CanvasAssetStorageError('素材超过服务器允许的大小', 413);
  }

  const release = await acquireWriteSlot(userId, options.signal);
  const userDirectory = path.join(/*turbopackIgnore: true*/ getAssetRoot(), userId);
  const temporaryPath = path.join(/*turbopackIgnore: true*/ userDirectory, `.upload-${randomUUID()}.tmp`);
  let fileHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    if (options.signal?.aborted) throw createCanceledError();
    await mkdir(/*turbopackIgnore: true*/ userDirectory, { recursive: true, mode: 0o755 });
    fileHandle = await open(/*turbopackIgnore: true*/ temporaryPath, 'wx', 0o644);

    const hash = createHash('sha256');
    let asset: SupportedCanvasAsset | null = null;
    let signature: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let totalBytes = 0;
    let bytesWritten = 0;

    for await (const chunk of readChunks(source)) {
      if (options.signal?.aborted) throw createCanceledError();
      if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) continue;

      totalBytes += chunk.byteLength;
      if (totalBytes > absoluteMaxBytes) {
        throw new CanvasAssetStorageError('素材超过服务器允许的大小', 413);
      }

      signature = appendSignature(signature, chunk);
      if (!asset && signature.byteLength >= 12) {
        asset = detectCanvasAsset(signature);
        if (!asset) throw new CanvasAssetStorageError('仅支持 PNG、JPEG、WebP、GIF、AVIF、MP4、WebM 或 MOV 素材', 415);
        if (options.expectedKind && asset.kind !== options.expectedKind) {
          throw new CanvasAssetStorageError(
            options.expectedKind === 'video' ? '素材不是受支持的视频' : '素材不是受支持的图片',
            415,
          );
        }
        const kindMaxBytes = getCanvasAssetMaxBytes(asset.kind);
        if (options.declaredBytes !== undefined && options.declaredBytes > kindMaxBytes) {
          throw new CanvasAssetStorageError(`${asset.kind === 'video' ? '视频' : '图片'}超过服务器允许的大小`, 413);
        }
      }
      if (asset && totalBytes > getCanvasAssetMaxBytes(asset.kind)) {
        throw new CanvasAssetStorageError(`${asset.kind === 'video' ? '视频' : '图片'}超过服务器允许的大小`, 413);
      }

      hash.update(chunk);
      let chunkOffset = 0;
      while (chunkOffset < chunk.byteLength) {
        const { bytesWritten: written } = await fileHandle.write(
          chunk,
          chunkOffset,
          chunk.byteLength - chunkOffset,
          bytesWritten,
        );
        if (written <= 0) throw new CanvasAssetStorageError('素材写入失败', 500);
        chunkOffset += written;
        bytesWritten += written;
      }
    }

    if (totalBytes === 0) throw new CanvasAssetStorageError('素材文件为空', 400);
    asset ??= detectCanvasAsset(signature);
    if (!asset) throw new CanvasAssetStorageError('仅支持 PNG、JPEG、WebP、GIF、AVIF、MP4、WebM 或 MOV 素材', 415);
    if (options.expectedKind && asset.kind !== options.expectedKind) {
      throw new CanvasAssetStorageError(
        options.expectedKind === 'video' ? '素材不是受支持的视频' : '素材不是受支持的图片',
        415,
      );
    }
    if (totalBytes > getCanvasAssetMaxBytes(asset.kind)) {
      throw new CanvasAssetStorageError(`${asset.kind === 'video' ? '视频' : '图片'}超过服务器允许的大小`, 413);
    }
    if (options.declaredBytes !== undefined && totalBytes !== options.declaredBytes) {
      throw new CanvasAssetStorageError('素材实际大小与声明不一致', 400);
    }

    const fileName = `${hash.digest('hex')}.${asset.extension}`;
    const targetPath = path.join(/*turbopackIgnore: true*/ userDirectory, fileName);
    await fileHandle.close();
    fileHandle = undefined;

    try {
      await stat(/*turbopackIgnore: true*/ targetPath);
      return buildSavedAsset(userId, fileName, totalBytes, asset);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    const currentBytes = await getDirectoryBytes(userDirectory);
    if (currentBytes + totalBytes > getUserStorageMaxBytes()) {
      throw new CanvasAssetStorageError('个人画布存储空间已满，请删除不再使用的素材后重试', 507);
    }

    try {
      await rename(/*turbopackIgnore: true*/ temporaryPath, targetPath);
    } catch (renameError) {
      try {
        await stat(/*turbopackIgnore: true*/ targetPath);
      } catch {
        throw renameError;
      }
    }
    return buildSavedAsset(userId, fileName, totalBytes, asset);
  } finally {
    await fileHandle?.close().catch(() => undefined);
    await rm(/*turbopackIgnore: true*/ temporaryPath, { force: true }).catch(() => undefined);
    release();
  }
}

export async function saveCanvasAsset(userId: string, bytes: Uint8Array) {
  async function* source() {
    yield bytes;
  }
  return saveCanvasAssetStream(userId, source(), { declaredBytes: bytes.byteLength });
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
