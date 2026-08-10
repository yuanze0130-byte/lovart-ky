import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'ai-tool-request-guards');
await mkdir(tempDir, { recursive: true });

try {
  const sourcePath = path.join(root, 'src', 'lib', 'ai-tool-request-guards.ts');
  const outputPath = path.join(tempDir, 'ai-tool-request-guards.mjs');
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  await writeFile(outputPath, transpiled.outputText, 'utf8');
  const guards = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  const validRequest = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief: '一只猫寻找回家的路' }),
  });
  const parsedJson = await guards.readLimitedJson(validRequest, 1_024);
  assert.equal(parsedJson.brief, '一只猫寻找回家的路');

  await assert.rejects(
    guards.readLimitedJson(new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '4' },
      body: JSON.stringify({ value: 'too long' }),
    }), 8),
    (error) => error.code === 'REQUEST_TOO_LARGE' && error.status === 413,
  );

  await assert.rejects(
    guards.readLimitedJson(new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    }), 128),
    (error) => error.code === 'UNSUPPORTED_MEDIA_TYPE' && error.status === 415,
  );

  const script = guards.parseScriptWritingRequest({ brief: '  故事大纲  ', durationMinutes: 5 });
  assert.deepEqual(script, {
    brief: '故事大纲',
    genre: '剧情短片',
    durationMinutes: 5,
    characters: '',
  });
  assert.throws(
    () => guards.parseScriptWritingRequest({ brief: 'x'.repeat(10_001) }),
    (error) => error.code === 'INVALID_REQUEST',
  );

  const frameDataUrl = `data:image/jpeg;base64,${'A'.repeat(128)}`;
  const breakdown = guards.parseVideoBreakdownRequest({
    frames: [{ dataUrl: frameDataUrl, label: '0.0s' }],
    duration: 4.5,
    prompt: '分析运镜',
  });
  assert.equal(breakdown.frames[0].dataUrl, frameDataUrl);
  assert.throws(
    () => guards.parseVideoBreakdownRequest({ frames: [{ dataUrl: 'https://example.com/a.jpg' }] }),
    (error) => error.code === 'INVALID_REQUEST',
  );
  assert.throws(
    () => guards.parseVideoBreakdownRequest({ frames: Array.from({ length: 9 }, () => ({ dataUrl: frameDataUrl })) }),
    (error) => error.code === 'INVALID_REQUEST',
  );

  const rateKey = `test-${Date.now()}`;
  guards.enforceUserRateLimit(rateKey, 'script', { limit: 2, windowMs: 60_000, now: 1_000 });
  guards.enforceUserRateLimit(rateKey, 'script', { limit: 2, windowMs: 60_000, now: 1_001 });
  assert.throws(
    () => guards.enforceUserRateLimit(rateKey, 'script', { limit: 2, windowMs: 60_000, now: 1_002 }),
    (error) => error.code === 'RATE_LIMITED' && error.status === 429 && error.retryAfterSeconds === 60,
  );
  assert.equal(
    guards.enforceUserRateLimit(rateKey, 'script', { limit: 2, windowMs: 60_000, now: 61_000 }).remaining,
    1,
  );

  console.log('AI tool request guard tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
