import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import {
  detectCanvasAsset,
  getCanvasAssetMaxBytes,
  saveCanvasAsset,
  type CanvasAssetKind,
} from '@/lib/canvas-asset-server';
import {
  isPublicRemoteAssetAddress,
  parseRemoteCanvasAssetUrl,
  RemoteAssetPolicyError,
} from '@/lib/canvas-asset-remote-policy';

const DEFAULT_REMOTE_ASSET_TIMEOUT_MS = 45_000;
const MAX_REMOTE_ASSET_TIMEOUT_MS = 120_000;
const MAX_REMOTE_ASSET_REDIRECTS = 3;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

type DownloadResult =
  | { bytes: Uint8Array; redirectUrl?: never }
  | { bytes?: never; redirectUrl: URL };

export class CanvasAssetImportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CanvasAssetImportError';
    this.status = status;
  }
}

function getRemoteAssetTimeoutMs() {
  const configured = Number(process.env.CANVAS_REMOTE_ASSET_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_REMOTE_ASSET_TIMEOUT_MS;
  return Math.min(Math.floor(configured), MAX_REMOTE_ASSET_TIMEOUT_MS);
}

function getHostname(url: URL) {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname;
}

function timeoutError() {
  return new CanvasAssetImportError('远程素材下载超时', 504);
}

function canceledError() {
  return new CanvasAssetImportError('远程素材导入已取消', 499);
}

function remainingTime(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw timeoutError();
  return remaining;
}

async function withDeadline<T>(promise: Promise<T>, deadline: number) {
  const timeoutMs = remainingTime(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolvePublicAddress(url: URL, deadline: number): Promise<ResolvedAddress> {
  const hostname = getHostname(url);
  const literalFamily = isIP(hostname);
  const addresses: ResolvedAddress[] = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await withDeadline(
      lookup(hostname, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>,
      deadline,
    ).catch((error: unknown) => {
      if (error instanceof CanvasAssetImportError) throw error;
      throw new CanvasAssetImportError('无法解析远程素材服务器', 502);
    });

  if (addresses.length === 0) {
    throw new CanvasAssetImportError('无法解析远程素材服务器', 502);
  }
  if (addresses.some(({ address }) => !isPublicRemoteAssetAddress(address))) {
    throw new RemoteAssetPolicyError('远程素材地址不能指向本机或内网');
  }

  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

function downloadFromAddress(
  url: URL,
  address: ResolvedAddress,
  maxBytes: number,
  deadline: number,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const hostname = getHostname(url);
    const finish = (result: DownloadResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error instanceof CanvasAssetImportError || error instanceof RemoteAssetPolicyError) {
        reject(error);
      } else {
        reject(new CanvasAssetImportError('远程素材下载失败', 502));
      }
    };
    const request = https.request({
      protocol: 'https:',
      hostname: address.address,
      family: address.family,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      servername: isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: true,
      headers: {
        Accept: 'video/*, image/*, application/octet-stream;q=0.9',
        'Accept-Encoding': 'identity',
        Host: url.host,
        'User-Agent': 'Doodleverse-Canvas-Asset-Importer/1.0',
      },
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      if (REDIRECT_STATUS_CODES.has(statusCode)) {
        const location = response.headers.location;
        response.destroy();
        if (!location) {
          fail(new CanvasAssetImportError('远程素材重定向地址无效', 502));
          return;
        }
        try {
          finish({ redirectUrl: parseRemoteCanvasAssetUrl(new URL(location, url).toString()) });
        } catch (error) {
          fail(error);
        }
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.destroy();
        fail(new CanvasAssetImportError('远程素材服务器返回失败状态', 502));
        return;
      }

      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.destroy();
        fail(new CanvasAssetImportError('远程素材超过服务器允许的大小', 413));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          response.destroy();
          fail(new CanvasAssetImportError('远程素材超过服务器允许的大小', 413));
          return;
        }
        chunks.push(chunk);
      });
      response.on('aborted', () => fail(new CanvasAssetImportError('远程素材下载中断', 502)));
      response.on('error', fail);
      response.on('end', () => finish({ bytes: new Uint8Array(Buffer.concat(chunks, totalBytes)) }));
    });

    const timer = setTimeout(() => {
      const error = timeoutError();
      request.destroy(error);
      fail(error);
    }, remainingTime(deadline));
    const onAbort = () => {
      const error = canceledError();
      request.destroy(error);
      fail(error);
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    request.on('error', fail);
    if (!settled) request.end();
  });
}

export async function importRemoteCanvasAsset(
  userId: string,
  remoteUrl: string,
  expectedKind: CanvasAssetKind = 'video',
  signal?: AbortSignal,
) {
  const deadline = Date.now() + getRemoteAssetTimeoutMs();
  const maxBytes = getCanvasAssetMaxBytes(expectedKind);
  let url = parseRemoteCanvasAssetUrl(remoteUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_ASSET_REDIRECTS; redirectCount += 1) {
    if (signal?.aborted) throw canceledError();
    const address = await resolvePublicAddress(url, deadline);
    if (signal?.aborted) throw canceledError();
    const result = await downloadFromAddress(url, address, maxBytes, deadline, signal);
    if (result.redirectUrl) {
      if (redirectCount === MAX_REMOTE_ASSET_REDIRECTS) {
        throw new CanvasAssetImportError('远程素材重定向次数过多', 502);
      }
      url = result.redirectUrl;
      continue;
    }

    if (result.bytes.byteLength === 0) {
      throw new CanvasAssetImportError('远程素材文件为空', 422);
    }
    const asset = detectCanvasAsset(result.bytes);
    if (!asset) {
      throw new CanvasAssetImportError('远程地址未返回支持的图片或视频素材', 415);
    }
    if (asset.kind !== expectedKind) {
      throw new CanvasAssetImportError(
        expectedKind === 'video' ? '远程地址未返回视频素材' : '远程地址未返回图片素材',
        415,
      );
    }

    return saveCanvasAsset(userId, result.bytes);
  }

  throw new CanvasAssetImportError('远程素材重定向次数过多', 502);
}
