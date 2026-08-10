import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'image-models');
const sourcePath = path.join(root, 'src', 'lib', 'image-models.ts');
const outputPath = path.join(tempDir, 'image-models.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const models = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  assert.equal(models.IMAGE_MODEL_OPTIONS.length, 24);
  assert.equal(new Set(models.IMAGE_MODEL_OPTIONS.map((model) => model.id)).size, 24);
  assert.equal(models.normalizeImageModelId('standard'), 'nano-banana-2');
  assert.equal(models.normalizeImageModelId('pro'), 'nano-banana-pro');
  assert.equal(models.getImageModelDefinition('gpt-image-1.5').transport, 'image-task');
  assert.equal(models.getImageModelDefinition('gpt-image-2-official').transport, 'official-image-task');
  assert.equal(models.getImageModelDefinition('nano-banana-2-lite').proxyModel, 'gemini-3.1-flash-lite-image');
  assert.equal(models.getImageModelDefinition('gemini-3.1-flash-image-official').proxyModel, 'gemini-3.1-flash-image');
  assert.equal(models.getImageModelDefinition('gpt-4o-image').transport, 'chat');
  assert.equal(models.getImageModelDefinition('flux-kontext').proxyModel, 'flux-kontext-pro');
  assert.equal(models.getImageModelDefinition('z-image-official').proxyModel, 'z-image-turbo');
  assert.equal(models.getImageModelDefinition('seedream-5.0-pro-official').proxyModel, 'seedream-v5-pro');
  assert.equal(models.getImageModelDefinition('seedream-4.5').category, 'ByteDance');
  assert.equal(models.isImageModelId('qwen-image-edit'), true);
  assert.equal(models.isImageModelId('unknown-image-model'), false);
  console.log('Image model registry tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
