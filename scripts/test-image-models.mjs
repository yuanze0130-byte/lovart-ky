import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'image-models');
const sourcePath = path.join(root, 'src', 'lib', 'image-models.ts');
const outputPath = path.join(tempDir, 'image-models.mjs');
const preferencesSourcePath = path.join(root, 'src', 'lib', 'image-model-preferences.ts');
const preferencesOutputPath = path.join(tempDir, 'image-model-preferences.mjs');
const routingSourcePath = path.join(root, 'src', 'lib', 'image-model-routing.ts');
const routingOutputPath = path.join(tempDir, 'image-model-routing.mjs');
const upstreamRequestSourcePath = path.join(root, 'src', 'lib', 'image-upstream-request.ts');
const upstreamRequestOutputPath = path.join(tempDir, 'image-upstream-request.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');
const preferencesSource = await readFile(preferencesSourcePath, 'utf8');
const preferencesTranspiled = ts.transpileModule(preferencesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: preferencesSourcePath,
});
await writeFile(
  preferencesOutputPath,
  preferencesTranspiled.outputText.replace(/from ['"]@\/lib\/image-models['"]/, "from './image-models.mjs'"),
  'utf8',
);
const routingSource = await readFile(routingSourcePath, 'utf8');
const routingTranspiled = ts.transpileModule(routingSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: routingSourcePath,
});
await writeFile(
  routingOutputPath,
  routingTranspiled.outputText.replace(/from ['"]@\/lib\/image-models['"]/, "from './image-models.mjs'"),
  'utf8',
);
const upstreamRequestSource = await readFile(upstreamRequestSourcePath, 'utf8');
const upstreamRequestTranspiled = ts.transpileModule(upstreamRequestSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: upstreamRequestSourcePath,
});
await writeFile(upstreamRequestOutputPath, upstreamRequestTranspiled.outputText, 'utf8');

try {
  const models = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  assert.equal(models.IMAGE_MODEL_OPTIONS.length, 14);
  assert.equal(new Set(models.IMAGE_MODEL_OPTIONS.map((model) => model.id)).size, 14);
  assert.equal(new Set(models.IMAGE_MODEL_OPTIONS.map((model) => model.proxyModel)).size, 14);
  assert.equal(models.normalizeImageModelId('standard'), 'nano-banana-2');
  assert.equal(models.normalizeImageModelId('pro'), 'nano-banana-pro');
  assert.equal(models.getImageModelDefinition('gpt-image-2-official').transport, 'official-image-task');
  assert.equal(models.getImageModelDefinition('gpt-image-2').label, 'GPT Image 2 低价版（1K）');
  assert.equal(models.getImageModelDefinition('gpt-image-2.5-flare').transport, 'official-image-task');
  assert.deepEqual(models.getImageModelDefinition('gpt-image-2.5-flare').upstreamModels, {
    '1K': 'gpt-image-2.5-flare',
    '2K': 'gpt-image-2.5-flare-2k',
    '4K': 'gpt-image-2.5-flare-4k',
  });
  assert.deepEqual(models.getImageModelDefinition('gpt-image-2.5-sunburst').upstreamModels, {
    '1K': 'gpt-image-2.5-sunburst',
    '2K': 'gpt-image-2.5-sunburst-2k',
    '4K': 'gpt-image-2.5-sunburst-4k',
  });
  assert.equal(models.getImageModelDefinition('nano-banana-2-lite').proxyModel, 'gemini-3.1-flash-lite-image');
  assert.equal(models.getImageModelDefinition('gemini-3.1-flash-image-official').proxyModel, 'gemini-3.1-flash-image');
  assert.equal(models.getImageModelDefinition('seedream-5.0-pro-official').proxyModel, 'seedream-v5-pro');
  assert.equal(models.getImageModelDefinition('seedream-5.0-pro-official').transport, 'image-generation');
  assert.deepEqual(models.getImageModelDefinition('seedream-5.0-pro-official').supportedResolutions, ['1K', '2K']);
  assert.equal(models.getImageModelDefinition('seedream-4.5-api').category, 'ByteDance');
  assert.equal(models.getImageModelDefinition('seedream-4.5-api').transport, 'image-generation');
  assert.deepEqual(models.getImageModelDefinition('seedream-4.5-api').supportedResolutions, ['2K', '4K']);
  assert.equal(models.getImageModelDefinition('seedream-5.0-api').transport, 'image-generation');
  assert.deepEqual(models.getImageModelDefinition('seedream-5.0-api').supportedResolutions, ['2K', '3K']);
  for (const removedModelId of [
    'nano-banana',
    'gpt-4o-image',
    'gpt-image-1',
    'gpt-image-1.5',
    'flux-kontext',
    'grok-4.1-image',
    'grok-4.2-image',
    'seedream-4.0',
    'seedream-4.5',
    'qwen-image-edit',
    'z-image-official',
    'midjourney',
  ]) {
    assert.equal(models.isImageModelId(removedModelId), false, `${removedModelId} should be disabled`);
  }
  assert.deepEqual(models.IMAGE_MODEL_CATEGORIES, ['Google', 'OpenAI', 'ByteDance']);
  assert.equal(models.isImageModelId('unknown-image-model'), false);

  const routing = await import(`${pathToFileURL(routingOutputPath).href}?v=${Date.now()}`);
  process.env.GEMINI_PROXY_STANDARD_MODEL = 'stale-nano-banana';
  process.env.GEMINI_PROXY_GPT_IMAGE_2_MODEL = 'stale-gpt-image-2';
  assert.equal(routing.resolveImageUpstreamModel({ modelId: 'nano-banana-2', resolution: '1K' }), 'nano-banana-2');
  assert.equal(routing.resolveImageUpstreamModel({ modelId: 'nano-banana-2', resolution: '2K' }), 'nano-banana-2-2k');
  assert.equal(routing.resolveImageUpstreamModel({ modelId: 'nano-banana-2', resolution: '4K' }), 'nano-banana-2-4k');
  assert.equal(routing.resolveImageUpstreamModel({ modelId: 'gpt-image-2', resolution: '1K' }), 'gpt-image-2-all');
  assert.equal(routing.resolveImageUpstreamModel({ modelId: 'gpt-image-2.5-flare', resolution: '2K' }), 'gpt-image-2.5-flare-2k');
  assert.equal(routing.resolveImageUpstreamModel({ modelId: 'gpt-image-2.5-sunburst', resolution: '4K' }), 'gpt-image-2.5-sunburst-4k');
  assert.throws(
    () => routing.resolveImageUpstreamModel({ modelId: 'gpt-image-2', resolution: '2K' }),
    { code: 'IMAGE_MODEL_RESOLUTION_UNSUPPORTED' },
  );
  assert.throws(
    () => routing.resolveImageUpstreamModel({ modelId: 'nano-banana-2-lite', resolution: '4K' }),
    { code: 'IMAGE_MODEL_RESOLUTION_UNSUPPORTED' },
  );
  for (const model of models.IMAGE_MODEL_OPTIONS) {
    for (const resolution of model.supportedResolutions) {
      assert.equal(
        routing.resolveImageUpstreamModel({ modelId: model.id, resolution }),
        model.upstreamModels[resolution],
        `${model.id}/${resolution} routing should come from the catalog`,
      );
    }
  }

  const upstreamRequest = await import(`${pathToFileURL(upstreamRequestOutputPath).href}?v=${Date.now()}`);
  assert.equal(upstreamRequest.resolveImageApiKind(0), 'generation');
  assert.equal(upstreamRequest.resolveImageApiKind(1), 'edit');
  assert.equal(
    upstreamRequest.buildImageApiEndpoint('https://doodleverse.fun/v1/', 'generation', true),
    'https://doodleverse.fun/v1/images/generations?async=true',
  );
  assert.equal(
    upstreamRequest.buildImageApiEndpoint('https://doodleverse.fun/v1', 'edit', true),
    'https://doodleverse.fun/v1/images/edits?async=true',
  );
  assert.equal(upstreamRequest.getSeedreamImageSize({
    modelId: 'seedream-5.0-api', resolution: '3K', aspectRatio: '16:9', referenceCount: 0,
  }), '4096x2304');
  assert.equal(upstreamRequest.getSeedreamImageSize({
    modelId: 'seedream-5.0-api', resolution: '2K', aspectRatio: '16:9', referenceCount: 1,
  }), '2560x1440');
  assert.deepEqual(upstreamRequest.buildSeedreamGenerationBody({
    modelId: 'seedream-4.5-api',
    model: 'doubao-seedream-4-5-251128',
    prompt: 'test',
    resolution: '4K',
    aspectRatio: '3:2',
    references: ['https://example.com/reference.png'],
  }), {
    model: 'doubao-seedream-4-5-251128',
    prompt: 'test',
    size: '4992x3328',
    response_format: 'b64_json',
    watermark: false,
    sequential_image_generation: 'disabled',
    image: 'https://example.com/reference.png',
  });

  const preferences = await import(`${pathToFileURL(preferencesOutputPath).href}?v=${Date.now()}`);
  const sanitized = preferences.sanitizeImageModelPreferences({
    modelOrder: ['grok-4.2-image', 'standard', 'gpt-image-2'],
    hiddenModelIds: ['midjourney', 'pro'],
    lastUsedModelId: 'flux-kontext',
    defaults: { modelId: 'qwen-image-edit' },
  });
  assert.deepEqual(sanitized.modelOrder.slice(0, 2), ['nano-banana-2', 'gpt-image-2']);
  assert.deepEqual(sanitized.hiddenModelIds, ['nano-banana-pro']);
  assert.equal(sanitized.lastUsedModelId, 'nano-banana-pro');
  assert.equal(sanitized.defaults.modelId, 'nano-banana-pro');
  console.log('Image model registry tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
