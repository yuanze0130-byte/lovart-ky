import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'image-response-candidates');
await mkdir(tempDir, { recursive: true });

try {
  const sourcePath = path.join(root, 'src', 'lib', 'image-response-candidates.ts');
  const outputPath = path.join(tempDir, 'image-response-candidates.mjs');
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  await writeFile(outputPath, transpiled.outputText, 'utf8');
  const { collectImageResponseCandidates } = await import(
    `${pathToFileURL(outputPath).href}?v=${Date.now()}`
  );

  assert.deepEqual(
    collectImageResponseCandidates({
      choices: [{ message: { content: '![result](https://cdn.example.com/generated?id=42)' } }],
    })[0],
    { kind: 'url', value: 'https://cdn.example.com/generated?id=42' },
  );

  assert.deepEqual(
    collectImageResponseCandidates({
      data: { result: { output_url: 'https://cdn.example.com/assets/abc?token=signed' } },
    })[0],
    { kind: 'url', value: 'https://cdn.example.com/assets/abc?token=signed' },
  );

  const inline = `data:image/webp;base64,${'A'.repeat(120)}`;
  assert.deepEqual(
    collectImageResponseCandidates({ choices: [{ message: { content: inline } }] })[0],
    { kind: 'data-url', value: inline },
  );

  const base64 = 'A'.repeat(120);
  assert.deepEqual(
    collectImageResponseCandidates({ images: [{ image_base64: base64 }] })[0],
    { kind: 'base64', value: base64, mimeType: 'image/png' },
  );

  const duplicateCandidates = collectImageResponseCandidates({
    image_url: 'https://cdn.example.com/image',
    message: `https://cdn.example.com/image`,
  });
  assert.equal(duplicateCandidates.filter((item) => item.value === 'https://cdn.example.com/image').length, 1);

  console.log('Image response candidate tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
