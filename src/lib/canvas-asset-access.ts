import { createHmac, timingSafeEqual } from 'node:crypto';

const ASSET_PATH = /^\/media\/canvas\/([0-9a-f-]{36})\/([0-9a-f]{64}\.(?:png|jpg|webp|gif|avif|mp4|webm|mov))$/i;
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function getSigningSecret() {
  const secret = process.env.CANVAS_ASSET_URL_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('CANVAS_ASSET_URL_SECRET_NOT_CONFIGURED');
  }
  return secret;
}

function signatureFor(pathname: string, expires: number) {
  return createHmac('sha256', getSigningSecret())
    .update(`${pathname}:${expires}`)
    .digest('base64url');
}

export function parseCanvasAssetPath(value: string) {
  let pathname = value;
  try {
    pathname = new URL(value, 'https://doodleverse.invalid').pathname;
  } catch {
    return null;
  }
  const match = ASSET_PATH.exec(pathname);
  if (!match) return null;
  return { pathname, userId: match[1], fileName: match[2] };
}

export function createSignedCanvasAssetUrl(
  userId: string,
  fileName: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const pathname = `/media/canvas/${userId}/${fileName}`;
  if (!ASSET_PATH.test(pathname)) throw new Error('INVALID_CANVAS_ASSET_PATH');
  const expires = nowSeconds + DEFAULT_TTL_SECONDS;
  const signature = signatureFor(pathname, expires);
  return `${pathname}?e=${expires}&s=${encodeURIComponent(signature)}`;
}

export function verifySignedCanvasAssetUrl(value: string, nowSeconds = Math.floor(Date.now() / 1_000)) {
  let url: URL;
  try {
    url = new URL(value, 'https://doodleverse.invalid');
  } catch {
    return false;
  }
  if (!ASSET_PATH.test(url.pathname)) return false;
  const expires = Number(url.searchParams.get('e'));
  const received = url.searchParams.get('s') || '';
  if (!Number.isSafeInteger(expires) || expires <= nowSeconds || received.length > 128) return false;
  const expected = signatureFor(url.pathname, expires);
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
