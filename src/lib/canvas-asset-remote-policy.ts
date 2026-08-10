import { isIP } from 'node:net';

const MAX_REMOTE_ASSET_URL_LENGTH = 2_048;

export class RemoteAssetPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteAssetPolicyError';
  }
}

function parseIpv4(address: string) {
  if (isIP(address) !== 4) return null;
  const parts = address.split('.').map(Number);
  return parts.length === 4 ? parts : null;
}

function parseIpv6(address: string) {
  let source = address.toLowerCase();
  if (source.startsWith('[') && source.endsWith(']')) source = source.slice(1, -1);
  if (source.includes('%') || isIP(source) !== 6) return null;

  const ipv4Separator = source.lastIndexOf(':');
  const ipv4Tail = source.slice(ipv4Separator + 1);
  if (ipv4Tail.includes('.')) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (!ipv4) return null;
    source = `${source.slice(0, ipv4Separator + 1)}${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const compressed = source.split('::');
  if (compressed.length > 2) return null;

  const left = compressed[0] ? compressed[0].split(':') : [];
  const right = compressed.length === 2 && compressed[1] ? compressed[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((compressed.length === 1 && missing !== 0) || (compressed.length === 2 && missing < 1)) return null;

  const groups = compressed.length === 2
    ? [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  return groups.reduce((value, group) => (value << BigInt(16)) | BigInt(`0x${group}`), BigInt(0));
}

function ipv6CidrContains(value: bigint, base: bigint, prefixLength: number) {
  const shift = BigInt(128 - prefixLength);
  return (value >> shift) === (base >> shift);
}

const IPV6_2000 = parseIpv6('2000::')!;
const BLOCKED_IPV6_RANGES: Array<[bigint, number]> = [
  [parseIpv6('2001::')!, 23],
  [parseIpv6('2001:db8::')!, 32],
  [parseIpv6('2002::')!, 16],
  [parseIpv6('3ffe::')!, 16],
  [parseIpv6('3fff::')!, 20],
];

function isPublicIpv4(address: string) {
  const parts = parseIpv4(address);
  if (!parts) return false;
  const [a, b, c] = parts;

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;

  return true;
}

function isPublicIpv6(address: string) {
  const value = parseIpv6(address);
  if (value === null || !ipv6CidrContains(value, IPV6_2000, 3)) return false;
  return !BLOCKED_IPV6_RANGES.some(([base, prefix]) => ipv6CidrContains(value, base, prefix));
}

export function isPublicRemoteAssetAddress(address: string) {
  const family = isIP(address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function parseRemoteCanvasAssetUrl(value: string) {
  if (!value || value.length > MAX_REMOTE_ASSET_URL_LENGTH) {
    throw new RemoteAssetPolicyError('远程素材地址无效');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteAssetPolicyError('远程素材地址无效');
  }

  if (url.protocol !== 'https:') {
    throw new RemoteAssetPolicyError('远程素材仅允许使用 HTTPS 地址');
  }
  if (url.username || url.password) {
    throw new RemoteAssetPolicyError('远程素材地址不能包含登录凭据');
  }
  if (url.port && url.port !== '443') {
    throw new RemoteAssetPolicyError('远程素材仅允许使用标准 HTTPS 端口');
  }

  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname;
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new RemoteAssetPolicyError('远程素材地址不能指向本机或内网');
  }
  if (isIP(hostname) && !isPublicRemoteAssetAddress(hostname)) {
    throw new RemoteAssetPolicyError('远程素材地址不能指向本机或内网');
  }

  url.hash = '';
  return url;
}
