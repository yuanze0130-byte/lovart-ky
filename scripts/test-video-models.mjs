import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'video-models');
const sourcePath = path.join(root, 'src', 'lib', 'video-models.ts');
const outputPath = path.join(tempDir, 'video-models.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const registry = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  assert.equal(registry.VIDEO_MODELS.length, 45);
  assert.equal(new Set(registry.VIDEO_MODELS.map((entry) => entry.id)).size, 45);
  assert.equal(registry.getVideoModelDefinition('vidu-q2').apiModel, 'viduq2');
  assert.equal(registry.getVideoModelDefinition('kling-video-v2-6').supportsGenerateAudio, true);
  assert.equal(registry.getVideoModelDefinition('wan2.6-i2v').supportsMultiShot, true);
  assert.equal(registry.getVideoModelDefinition('google-veo3.1').supportsStartEndFrames, true);
  assert.equal(registry.normalizeVideoGenerationConfig({ modelId: 'sora-2-pro', duration: 8, hd: true }).hd, false);
  assert.equal(registry.normalizeVideoGenerationConfig({ modelId: 'sora-2-pro', duration: 10, hd: true }).hd, true);
  assert.equal(registry.normalizeVideoGenerationConfig({ modelId: 'unknown' }).modelId, registry.DEFAULT_VIDEO_MODEL_ID);
  assert.equal(registry.normalizeVideoGenerationConfig({ modelId: 'wan2.6-i2v' }).aspectRatio, '16:9');
  console.log('Video model registry tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
