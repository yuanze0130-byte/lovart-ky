import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-asset-references');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-asset-references.ts');
const outputPath = path.join(tempDir, 'canvas-asset-references.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const { replaceCanvasAssetReference } = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  assert.deepEqual(replaceCanvasAssetReference(['a', 'b', 'c'], 'b', 'd'), ['a', 'd', 'c']);
  assert.deepEqual(replaceCanvasAssetReference(['a', 'b', 'c'], 'b', 'a'), ['a', 'c']);
  assert.deepEqual(replaceCanvasAssetReference(['a', 'b'], 'a', 'a'), ['a', 'b']);
  assert.deepEqual(replaceCanvasAssetReference(['a'], 'missing', 'b'), ['a', 'b']);
  assert.deepEqual(replaceCanvasAssetReference(['a', 'a', 'b'], 'a', 'c'), ['c', 'b']);

  console.log('Canvas asset reference tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
