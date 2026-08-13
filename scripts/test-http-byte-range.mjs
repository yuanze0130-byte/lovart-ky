import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'http-byte-range');
const sourcePath = path.join(root, 'src', 'lib', 'http-byte-range.ts');
const outputPath = path.join(tempDir, 'http-byte-range.mjs');
await mkdir(tempDir, { recursive: true });

try {
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  await writeFile(outputPath, transpiled.outputText, 'utf8');
  const { parseSingleHttpByteRange } = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  assert.deepEqual(parseSingleHttpByteRange('bytes=0-99', 1_000), { start: 0, end: 99 });
  assert.deepEqual(parseSingleHttpByteRange('bytes=900-', 1_000), { start: 900, end: 999 });
  assert.deepEqual(parseSingleHttpByteRange('bytes=-100', 1_000), { start: 900, end: 999 });
  assert.deepEqual(parseSingleHttpByteRange('bytes=-2000', 1_000), { start: 0, end: 999 });
  assert.deepEqual(parseSingleHttpByteRange('bytes=900-2000', 1_000), { start: 900, end: 999 });
  assert.equal(parseSingleHttpByteRange('bytes=-0', 1_000), null);
  assert.equal(parseSingleHttpByteRange('bytes=-', 1_000), null);
  assert.equal(parseSingleHttpByteRange('bytes=1000-', 1_000), null);
  assert.equal(parseSingleHttpByteRange('bytes=100-99', 1_000), null);
  assert.equal(parseSingleHttpByteRange('bytes=0-1,2-3', 1_000), null);

  console.log('HTTP byte range tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
