import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-asset-import');
await mkdir(tempDir, { recursive: true });

async function compile(sourceName, outputName) {
  const sourcePath = path.join(root, 'src', 'lib', sourceName);
  const outputPath = path.join(tempDir, outputName);
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  await writeFile(outputPath, transpiled.outputText, 'utf8');
  return { outputPath, source };
}

try {
  const policy = await compile('canvas-asset-remote-policy.ts', 'canvas-asset-remote-policy.mjs');
  const importServerSource = await readFile(
    path.join(root, 'src', 'lib', 'canvas-asset-import-server.ts'),
    'utf8',
  );
  const routeSource = await readFile(
    path.join(root, 'src', 'app', 'api', 'canvas-assets', 'import', 'route.ts'),
    'utf8',
  );
  const clientSource = await readFile(path.join(root, 'src', 'lib', 'canvas-asset-upload.ts'), 'utf8');
  const {
    isPublicRemoteAssetAddress,
    parseRemoteCanvasAssetUrl,
    RemoteAssetPolicyError,
  } = await import(`${pathToFileURL(policy.outputPath).href}?v=${Date.now()}`);

  assert.equal(isPublicRemoteAssetAddress('8.8.8.8'), true);
  assert.equal(isPublicRemoteAssetAddress('2606:4700:4700::1111'), true);
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ]) {
    assert.equal(isPublicRemoteAssetAddress(address), false, address);
  }

  assert.equal(parseRemoteCanvasAssetUrl('https://cdn.example.com/video.mp4#fragment').hash, '');
  for (const value of [
    'http://cdn.example.com/video.mp4',
    'https://user:pass@cdn.example.com/video.mp4',
    'https://cdn.example.com:8443/video.mp4',
    'https://localhost/video.mp4',
    'https://127.1/video.mp4',
    'https://[::1]/video.mp4',
  ]) {
    assert.throws(() => parseRemoteCanvasAssetUrl(value), RemoteAssetPolicyError, value);
  }

  assert.match(importServerSource, /lookup\(hostname, \{ all: true, verbatim: true \}\)/);
  assert.match(importServerSource, /hostname: address\.address/);
  assert.match(importServerSource, /MAX_REMOTE_ASSET_REDIRECTS = 3/);
  assert.match(importServerSource, /totalBytes > maxBytes/);
  assert.match(routeSource, /requireUser\(request\)/);
  assert.match(routeSource, /importRemoteCanvasAsset\(user\.id, url, kind, request\.signal\)/);
  assert.match(clientSource, /export function importRemoteCanvasVideo/);

  console.log('Canvas remote asset import policy tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
