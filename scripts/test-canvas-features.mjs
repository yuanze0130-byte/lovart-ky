import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-features');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-feature-settings.ts');
const outputPath = path.join(tempDir, 'canvas-feature-settings.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const features = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  const defaults = features.DEFAULT_CANVAS_FEATURE_SETTINGS;
  assert.equal(Object.keys(defaults).length, 17);
  assert.equal(Object.values(defaults).filter((value) => typeof value === 'boolean').length, 13);
  assert.equal(defaults.hideConnectors, false);
  assert.equal(defaults.gridGap, 20);
  assert.equal(defaults.gridDotSize, 0.5);
  assert.equal(defaults.connectorWidth, 2);
  assert.equal(defaults.connectorOpacity, 100);

  const normalized = features.normalizeCanvasFeatureSettings({
    grid: false,
    snap: false,
    gridGap: 999,
    gridDotSize: 0,
    connectorWidth: 20,
    connectorOpacity: 1,
  });
  assert.equal(normalized.grid, false);
  assert.equal(normalized.snap, false);
  assert.equal(normalized.gridGap, 80);
  assert.equal(normalized.gridDotSize, 0.2);
  assert.equal(normalized.connectorWidth, 8);
  assert.equal(normalized.connectorOpacity, 10);
  assert.equal(features.getCanvasFeatureStorageKey('abc'), 'doodleverse.canvas-features.abc');
  assert.equal(features.getCanvasFeatureStorageKey(null), 'doodleverse.canvas-features.local');
  console.log('Canvas feature settings tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
