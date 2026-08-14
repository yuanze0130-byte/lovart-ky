import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'image-pricing');
const sourcePath = path.join(root, 'src', 'lib', 'image-pricing.ts');
const outputPath = path.join(tempDir, 'image-pricing.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(
  source
    .replace("import type { ImageModelId } from '@/lib/image-models';", '')
    .replace("import type { ImageResolution } from '@/lib/image-model-routing';", ''),
  {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  },
);
await writeFile(outputPath, transpiled.outputText, 'utf8');

const quote = (upstreamModel, resolution = '1K', referenceCount = 0) => pricing.quoteImageCredits({
  modelId: 'nano-banana-pro',
  upstreamModel,
  resolution,
  referenceCount,
});

let pricing;
try {
  pricing = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  assert.equal(pricing.IMAGE_POINTS_PER_COMFLY_UNIT, 15);
  assert.equal(quote('gpt-image-2-all').credits, 1);
  assert.equal(quote('nano-banana').credits, 3);
  assert.equal(quote('nano-banana-hd', '2K').credits, 4);
  assert.equal(quote('nano-banana-pro').credits, 7);
  assert.equal(quote('nano-banana-pro-4k', '4K').credits, 9);
  assert.equal(quote('gemini-3.1-flash-image-preview-4k', '4K').credits, 5);
  assert.equal(quote('qwen-image-edit').credits, 4);
  assert.equal(quote('seedream-v5-pro', '1K', 0).credits, 5);
  assert.equal(quote('seedream-v5-pro', '1K', 4).credits, 6);
  assert.equal(quote('seedream-v5-pro', '4K', 4).credits, 10);
  assert.equal(pricing.imageCreditsFromCostUnits(16_000), 3);
  assert.throws(() => quote('flux-kontext-pro'), { code: 'IMAGE_PRICE_UNAVAILABLE' });
  assert.throws(() => quote('midjourney'), { code: 'IMAGE_PRICE_UNAVAILABLE' });
  assert.throws(() => quote('gemini-3.1-flash-lite-image', '2K'), { code: 'IMAGE_PRICE_UNAVAILABLE' });
  assert.throws(() => quote('gpt-image-2-all', '4K'), { code: 'IMAGE_PRICE_UNAVAILABLE' });
  console.log('Image pricing tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
