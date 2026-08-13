import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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
  const assetServer = await compile('canvas-asset-server.ts', 'canvas-asset-server.mjs');
  const importServerSource = await readFile(
    path.join(root, 'src', 'lib', 'canvas-asset-import-server.ts'),
    'utf8',
  );
  const routeSource = await readFile(
    path.join(root, 'src', 'app', 'api', 'canvas-assets', 'import', 'route.ts'),
    'utf8',
  );
  const clientSource = await readFile(path.join(root, 'src', 'lib', 'canvas-asset-upload.ts'), 'utf8');
  const uploadRouteSource = await readFile(
    path.join(root, 'src', 'app', 'api', 'canvas-assets', 'route.ts'),
    'utf8',
  );
  const {
    isPublicRemoteAssetAddress,
    parseRemoteCanvasAssetUrl,
    RemoteAssetPolicyError,
  } = await import(`${pathToFileURL(policy.outputPath).href}?v=${Date.now()}`);
  const { CanvasAssetStorageError, saveCanvasAssetStream } = await import(
    `${pathToFileURL(assetServer.outputPath).href}?v=${Date.now()}`
  );

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
  assert.match(importServerSource, /saveCanvasAssetStream/);
  assert.doesNotMatch(importServerSource, /Buffer\.concat|const chunks:/);
  assert.match(routeSource, /requireUser\(request\)/);
  assert.match(routeSource, /importRemoteCanvasAsset\(user\.id, url, kind, request\.signal\)/);
  assert.match(clientSource, /export function importRemoteCanvasVideo/);
  assert.match(clientSource, /body: blob/);
  assert.match(clientSource, /value\.startsWith\('blob:'\)/);
  assert.doesNotMatch(clientSource, /new FormData\(\)/);
  assert.match(uploadRouteSource, /saveCanvasAssetStream\(userId, request\.body/);

  const assetRoot = path.join(tempDir, 'assets');
  process.env.CANVAS_ASSET_DIR = assetRoot;
  process.env.CANVAS_ASSET_MAX_BYTES = '64';
  process.env.CANVAS_VIDEO_ASSET_MAX_BYTES = '96';
  process.env.CANVAS_ASSET_MAX_CONCURRENT_WRITES = '2';
  process.env.CANVAS_ASSET_MAX_CONCURRENT_WRITES_PER_USER = '1';
  const userId = '11111111-1111-4111-8111-111111111111';
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  ]);
  async function* chunked(bytes, chunkSize = 3) {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      yield bytes.subarray(offset, offset + chunkSize);
    }
  }

  const saved = await saveCanvasAssetStream(userId, chunked(pngBytes), {
    declaredBytes: pngBytes.byteLength,
    expectedKind: 'image',
  });
  assert.equal(saved.kind, 'image');
  assert.equal((await stat(path.join(assetRoot, userId, saved.fileName))).size, pngBytes.byteLength);

  await assert.rejects(
    saveCanvasAssetStream(userId, chunked(pngBytes), {
      declaredBytes: pngBytes.byteLength + 1,
      expectedKind: 'image',
    }),
    (error) => error instanceof CanvasAssetStorageError && error.status === 400,
  );
  await assert.rejects(
    saveCanvasAssetStream(userId, chunked(pngBytes), {
      declaredBytes: pngBytes.byteLength,
      expectedKind: 'video',
    }),
    (error) => error instanceof CanvasAssetStorageError && error.status === 415,
  );
  assert.deepEqual(
    (await readdir(path.join(assetRoot, userId))).filter((name) => name.endsWith('.tmp')),
    [],
  );

  const serializedUserId = '22222222-2222-4222-8222-222222222222';
  let releaseFirst;
  const firstMayFinish = new Promise((resolve) => { releaseFirst = resolve; });
  let firstStarted = false;
  let secondStarted = false;
  async function* delayedAsset(marker, gate) {
    marker();
    yield pngBytes.subarray(0, 12);
    if (gate) await gate;
    yield pngBytes.subarray(12);
  }

  const firstWrite = saveCanvasAssetStream(
    serializedUserId,
    delayedAsset(() => { firstStarted = true; }, firstMayFinish),
    { declaredBytes: pngBytes.byteLength, expectedKind: 'image' },
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  const secondWrite = saveCanvasAssetStream(
    serializedUserId,
    delayedAsset(() => { secondStarted = true; }),
    { declaredBytes: pngBytes.byteLength, expectedKind: 'image' },
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(firstStarted, true);
  assert.equal(secondStarted, false, 'per-user write limit should serialize disk writes');
  releaseFirst();
  await Promise.all([firstWrite, secondWrite]);
  assert.equal(secondStarted, true);

  console.log('Canvas remote asset import policy tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
