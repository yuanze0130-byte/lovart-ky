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
  const { replaceCanvasAssetReference, canvasReferenceGroups, addCanvasGroupReferences } = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  assert.deepEqual(replaceCanvasAssetReference(['a', 'b', 'c'], 'b', 'd'), ['a', 'd', 'c']);
  assert.deepEqual(replaceCanvasAssetReference(['a', 'b', 'c'], 'b', 'a'), ['a', 'c']);
  assert.deepEqual(replaceCanvasAssetReference(['a', 'b'], 'a', 'a'), ['a', 'b']);
  assert.deepEqual(replaceCanvasAssetReference(['a'], 'missing', 'b'), ['a', 'b']);
  assert.deepEqual(replaceCanvasAssetReference(['a', 'a', 'b'], 'a', 'c'), ['c', 'b']);

  const assets = [
    { id: 'self', groupId: 'g', kind: 'image', label: 'self', content: '/self' },
    { id: 'photo', groupId: 'g', kind: 'image', label: '照片', content: '/photo' },
    { id: 'prompt', groupId: 'g', kind: 'text', label: '文字', content: 'prompt' },
    { id: 'clip', groupId: 'g', kind: 'video', label: '视频', content: '/video' },
    { id: 'empty', groupId: 'g', kind: 'image', label: '空图', content: '' },
    { id: 'other', groupId: 'h', kind: 'image', label: '其他', content: '/other' },
  ];
  const groups = canvasReferenceGroups(assets, 'self', ['image', 'text']);
  assert.deepEqual(groups[0].memberIds, ['photo', 'prompt'], 'exclude self, unsupported media and empty nodes');
  const selected = addCanvasGroupReferences(['other', 'photo'], groups[0].memberIds);
  assert.deepEqual(selected, ['other', 'photo', 'prompt'], 'preserve existing selection and order; deduplicate');
  assert.deepEqual(addCanvasGroupReferences(selected, groups[0].memberIds), selected);
  assets.push({ id: 'later', groupId: 'g', kind: 'image', label: '后来', content: '/later' });
  assert.deepEqual(selected, ['other', 'photo', 'prompt'], 'saved references are stable when group membership changes');
  assert.deepEqual(canvasReferenceGroups(assets, 'self', ['audio']), []);
  assert.deepEqual(canvasReferenceGroups(assets.map(({ groupId, ...asset }) => asset), 'self', ['image']), [], 'old projects without groups work unchanged');

  console.log('Canvas asset reference tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
