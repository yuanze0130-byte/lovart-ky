import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-shortcuts');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-shortcuts.ts');
const outputPath = path.join(tempDir, 'canvas-shortcuts.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const shortcuts = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  const sourceElements = [
    { id: 'text', type: 'text', x: 10, y: 20, content: 'prompt', groupId: 'group-a' },
    { id: 'generator', type: 'image-generator', x: 300, y: 20, groupId: 'group-a' },
    {
      id: 'edge', type: 'connector', x: 0, y: 0,
      connectorFrom: 'text', connectorTo: 'generator',
      connectorSourcePort: 'prompt-out', connectorTargetPort: 'prompt-in',
    },
    { id: 'outside', type: 'image', x: 900, y: 20 },
  ];
  let nextId = 0;
  const duplicated = shortcuts.duplicateCanvasSelection(
    sourceElements,
    ['text', 'generator'],
    () => `new-${++nextId}`,
  );

  assert.equal(duplicated.elements.length, 3);
  assert.equal(duplicated.selectedIds.length, 2);
  const duplicatedNodes = duplicated.elements.filter((element) => element.type !== 'connector');
  assert.equal(new Set(duplicatedNodes.map((element) => element.groupId)).size, 1);
  assert.equal(duplicatedNodes.find((element) => element.type === 'text').x, 34);
  const duplicatedEdge = duplicated.elements.find((element) => element.type === 'connector');
  assert.equal(duplicated.selectedIds.includes(duplicatedEdge.connectorFrom), true);
  assert.equal(duplicated.selectedIds.includes(duplicatedEdge.connectorTo), true);

  const serialized = JSON.parse(shortcuts.serializeCanvasSelection(sourceElements, ['text', 'generator']));
  assert.equal(serialized.format, 'doodleverse-selection');
  assert.equal(serialized.elements.length, 3);
  assert.equal(serialized.elements.some((element) => element.id === 'outside'), false);
  console.log('Canvas shortcut tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
