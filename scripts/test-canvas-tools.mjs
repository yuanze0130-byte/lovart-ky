import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-tools');
await mkdir(tempDir, { recursive: true });

async function compile(sourceName, outputName, transform = (value) => value) {
  const sourcePath = path.join(root, 'src', 'lib', sourceName);
  const outputPath = path.join(tempDir, outputName);
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  await writeFile(outputPath, transform(transpiled.outputText), 'utf8');
  return outputPath;
}

try {
  const tablePath = await compile('table-editor.ts', 'table-editor.mjs');
  const alignmentPath = await compile('node-alignment.ts', 'node-alignment.mjs', (source) => source.replace(/import .*CanvasArea.*;\r?\n/, ''));
  const table = await import(`${pathToFileURL(tablePath).href}?v=${Date.now()}`);
  const alignment = await import(`${pathToFileURL(alignmentPath).href}?v=${Date.now()}`);

  const parsedMarkdown = table.parseTableContent('| 镜头 | 画面 |\n| --- | --- |\n| 1 | 远景 |');
  assert.deepEqual(parsedMarkdown.columns, ['镜头', '画面']);
  assert.deepEqual(parsedMarkdown.rows, [['1', '远景']]);
  const escapedMarkdown = table.parseTableContent('| A | B |\n| --- | --- |\n| one \\| two | line 1<br>line 2 |');
  assert.deepEqual(escapedMarkdown.rows, [['one | two', 'line 1\nline 2']]);
  const parsedCsv = table.parseTableContent('name,value\nA,1\nB,2');
  assert.deepEqual(parsedCsv.rows, [['A', '1'], ['B', '2']]);
  assert.match(table.tableToMarkdown(['A'], [['B']]), /\| A \|/);
  assert.equal(table.tableToCsv(['A'], [['hello,world']]), 'A\r\n"hello,world"');

  const elements = [
    { id: 'a', type: 'text', x: 10, y: 20, width: 100, height: 50 },
    { id: 'b', type: 'text', x: 240, y: 80, width: 120, height: 60 },
    { id: 'c', type: 'text', x: 500, y: 160, width: 80, height: 40 },
  ];
  const leftAligned = alignment.alignCanvasElements(elements, ['a', 'b', 'c'], 'left');
  assert.deepEqual(leftAligned.map((item) => item.x), [10, 10, 10]);
  const distributed = alignment.alignCanvasElements(elements, ['a', 'b', 'c'], 'distribute-horizontal-top');
  assert.deepEqual(distributed.map((item) => item.y), [20, 20, 20]);
  assert.ok(distributed[1].x > distributed[0].x);
  assert.ok(distributed[2].x > distributed[1].x);

  const overlapping = [
    { id: 'wide-a', type: 'text', x: 0, y: 0, width: 200, height: 60 },
    { id: 'wide-b', type: 'text', x: 50, y: 0, width: 200, height: 60 },
    { id: 'wide-c', type: 'text', x: 100, y: 0, width: 200, height: 60 },
  ];
  const overlapDistributed = alignment.alignCanvasElements(overlapping, ['wide-a', 'wide-b', 'wide-c'], 'distribute-horizontal');
  assert.equal(overlapDistributed[0].x, 0);
  assert.equal(overlapDistributed[2].x + overlapDistributed[2].width, 300, 'distribution should preserve the original selection bounds');

  const defaultSizedText = alignment.alignCanvasElements([
    { id: 'text-default', type: 'text', x: 0, y: 0 },
    { id: 'box', type: 'shape', x: 400, y: 0, width: 100, height: 100 },
  ], ['text-default', 'box'], 'right');
  assert.equal(defaultSizedText[0].width, 240);
  assert.equal(defaultSizedText[0].x, 260);

  console.log('Canvas table parsing and node alignment tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
