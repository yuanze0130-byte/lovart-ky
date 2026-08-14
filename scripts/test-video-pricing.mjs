import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'video-pricing');
const sourcePath = path.join(root, 'src', 'lib', 'video-pricing.ts');
const outputPath = path.join(tempDir, 'video-pricing.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source.replace("import type { VideoGenerationConfig } from '@/lib/video-models';", ''), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

const base = {
  aspectRatio: '16:9', duration: 5, resolution: '720p', hd: false, useStartEndFrames: false,
  audioMode: 'none', generateAudio: false, multiShot: false, cameraFixed: false, qualityMode: 'pro',
};

try {
  const pricing = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  const credits = (input) => pricing.quoteVideoCredits({ ...base, ...input }).credits;
  assert.equal(pricing.POINTS_PER_COMFLY_UNIT, 15);
  assert.equal(credits({ modelId: 'doubao-seedance-2-0-260128', duration: 4 }), 63);
  assert.equal(credits({ modelId: 'doubao-seedance-2-0-260128', duration: 5 }), 79);
  assert.equal(credits({ modelId: 'doubao-seedance-2-0-fast-260128', duration: 5 }), 71);
  assert.equal(credits({ modelId: 'wan2.6-i2v', resolution: '720p', duration: 5 }), 48);
  assert.equal(credits({ modelId: 'wan2.6-i2v', resolution: '1080p', duration: 10 }), 158);
  assert.equal(credits({ modelId: 'kling-video-v2-6', generateAudio: false, duration: 5 }), 40);
  assert.equal(credits({ modelId: 'kling-video-v2-6', generateAudio: true, duration: 10 }), 158);
  assert.equal(credits({ modelId: 'MiniMax-Hailuo-2.3', resolution: '768p', duration: 6 }), 32);
  assert.equal(credits({ modelId: 'MiniMax-Hailuo-2.3-Fast', resolution: '768p', duration: 6 }), 22);
  assert.equal(credits({ modelId: 'google-veo3.1', duration: 8 }), 19);
  assert.equal(credits({ modelId: 'google-veo3.1-pro', duration: 8 }), 111);
  assert.equal(pricing.quoteVideoCredits({ ...base, modelId: 'google-veo3.1-pro', duration: 8, resolution: '4K' }).upstreamModel, 'google-veo3.1-pro-4k');
  assert.equal(pricing.creditsFromCostMicros(135_000), 22);
  assert.throws(() => pricing.quoteVideoCredits({ ...base, modelId: 'sora-2' }), { code: 'VIDEO_PRICE_UNAVAILABLE' });
  assert.throws(() => pricing.quoteVideoCredits({ ...base, modelId: 'wan2.6-i2v', resolution: '4K' }), { code: 'VIDEO_PRICE_UNAVAILABLE' });
  console.log('Video pricing tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
