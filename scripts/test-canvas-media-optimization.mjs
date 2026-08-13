import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-media-optimization');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-media-optimization.ts');
const outputPath = path.join(tempDir, 'canvas-media-optimization.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const testableSource = source.replace(
  /import \{ importRemoteCanvasAsset, uploadCanvasAssetBlob \} from '@\/lib\/canvas-asset-upload';/,
  'const importRemoteCanvasAsset = async (source) => source; const uploadCanvasAssetBlob = async () => "/test-asset";',
);
const transpiled = ts.transpileModule(testableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const media = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  assert.equal(media.CANVAS_IMAGE_PREVIEW_MAX_EDGE, 1280);
  assert.equal(media.CANVAS_IMAGE_THUMBNAIL_MAX_EDGE, 360);
  assert.equal(media.CANVAS_VIDEO_POSTER_MAX_EDGE, 640);
  assert.deepEqual(media.getContainedMediaSize(4000, 2000, 1280), { width: 1280, height: 640 });
  assert.deepEqual(media.getContainedMediaSize(1000, 2000, 360), { width: 180, height: 360 });
  assert.deepEqual(media.getContainedMediaSize(320, 200, 1280), { width: 320, height: 200 });
  assert.throws(() => media.getContainedMediaSize(0, 200, 360));

  const canvasAreaSource = await readFile(
    path.join(root, 'src', 'components', 'lovart', 'CanvasArea.tsx'),
    'utf8',
  );
  const canvasMediaSource = await readFile(
    path.join(root, 'src', 'components', 'lovart', 'CanvasMedia.tsx'),
    'utf8',
  );
  const historySource = await readFile(
    path.join(root, 'src', 'components', 'lovart', 'GenerationHistoryPanel.tsx'),
    'utf8',
  );
  const optimizationHookSource = await readFile(
    path.join(root, 'src', 'hooks', 'useCanvasMediaOptimization.ts'),
    'utf8',
  );
  assert.match(canvasAreaSource, /const isLowDetail = scale < 0\.75/);
  assert.match(canvasAreaSource, /!isLowDetail && getNodePorts\(el\)\.map/);
  assert.match(canvasAreaSource, /activeVideoId === el\.id/);
  assert.match(canvasMediaSource, /if \(active\) \{[\s\S]*?<video/);
  assert.match(canvasMediaSource, /posterUrl \? \([\s\S]*?<img/);
  assert.doesNotMatch(historySource, /<video/);
  assert.match(optimizationHookSource, /isMediaNearViewport\(element, panX, panY, scale, viewportWidth, viewportHeight\)/);
  assert.match(optimizationHookSource, /runningKeysRef\.current\.size > 0/);
  assert.match(optimizationHookSource, /MEDIA_OPTIMIZATION_MAX_ATTEMPTS = 3/);
  assert.match(optimizationHookSource, /MEDIA_OPTIMIZATION_RETRY_BASE_MS = 15_000/);
  assert.match(optimizationHookSource, /MEDIA_FINGERPRINT_SAMPLES = 64/);
  assert.doesNotMatch(optimizationHookSource, /`\$\{element\.id\}:\$\{element\.content\}`/);
  assert.doesNotMatch(optimizationHookSource, /source\.slice/);
  assert.match(optimizationHookSource, /elementsRef\.current\.some/);
  assert.doesNotMatch(source, /blobToDataUrl|uploadOrInline/);
  assert.doesNotMatch(source, /uploadCanvasAssetBlob\([^\n]+\)\.catch\(\(\) => source\)/);
  assert.match(source, /source\.startsWith\('data:'\) \|\| source\.startsWith\('blob:'\)/);

  console.log('Canvas media optimization tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
