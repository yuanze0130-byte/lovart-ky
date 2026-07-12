import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'generation-jobs');
const sourcePath = path.join(root, 'src', 'lib', 'generation-jobs.ts');
const outputPath = path.join(tempDir, 'generation-jobs.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const jobs = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

  for (const status of ['queued', 'pending']) {
    assert.equal(jobs.normalizeGenerationJobStatus(status), 'queued');
  }
  for (const status of ['running', 'processing']) {
    assert.equal(jobs.normalizeGenerationJobStatus(status), 'running');
  }
  for (const status of ['succeeded', 'success', 'completed']) {
    assert.equal(jobs.normalizeGenerationJobStatus(status), 'succeeded');
  }
  for (const status of ['failed', 'failure', 'error', 'timeout', 'expired']) {
    assert.equal(jobs.normalizeGenerationJobStatus(status), 'failed');
  }
  for (const status of ['cancelled', 'canceled']) {
    assert.equal(jobs.normalizeGenerationJobStatus(status), 'cancelled');
  }

  assert.equal(jobs.getGenerationJobFailureKind('error'), 'failed');
  assert.equal(jobs.getGenerationJobFailureKind('canceled'), 'cancelled');
  assert.equal(jobs.getGenerationJobFailureKind('timed_out'), 'timeout');
  assert.equal(jobs.getGenerationJobFailureKind('expired'), 'expired');

  assert.equal(jobs.normalizeGenerationProgress(75, 'running'), 75);
  assert.equal(jobs.normalizeGenerationProgress('75%', 'running'), 75);
  assert.equal(jobs.normalizeGenerationProgress(-10, 'running'), 0);
  assert.equal(jobs.normalizeGenerationProgress(140, 'running'), 100);
  assert.equal(jobs.normalizeGenerationProgress(undefined, 'queued'), 0);
  assert.equal(jobs.normalizeGenerationProgress(undefined, 'running'), 50);
  assert.equal(jobs.normalizeGenerationProgress(undefined, 'succeeded'), 100);

  const successWithoutUrl = jobs.normalizeVideoGenerationJob({
    id: 'video-no-url',
    status: 'completed',
  });
  assert.equal(successWithoutUrl.status, 'succeeded');
  assert.equal(successWithoutUrl.progress, 100);
  assert.equal(jobs.isGenerationJobReady(successWithoutUrl), false);
  assert.equal(jobs.isGenerationJobTerminal(successWithoutUrl), true);

  const completedByOutput = jobs.normalizeVideoGenerationJob({
    id: 'video-with-url',
    nodeId: 'node-1',
    status: 'processing',
    progress: '100%',
    outputUrl: 'https://example.com/video.mp4',
    rawPayload: { status: 'processing' },
  });
  assert.equal(completedByOutput.status, 'succeeded');
  assert.equal(completedByOutput.progress, 100);
  assert.equal(completedByOutput.nodeId, 'node-1');
  assert.equal(completedByOutput.rawStatus, 'processing');
  assert.equal(jobs.isGenerationJobReady(completedByOutput), true);

  const cancelled = jobs.normalizeVideoGenerationJob({
    id: 'cancelled-video',
    status: 'canceled',
    progress: 80,
    outputUrl: 'https://example.com/partial.mp4',
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.failureKind, 'cancelled');
  assert.equal(jobs.isGenerationJobReady(cancelled), false);

  const synchronousImage = jobs.normalizeSynchronousImageJob({
    id: 'image-1',
    imageData: 'data:image/png;base64,abc',
  });
  assert.equal(synchronousImage.kind, 'image');
  assert.equal(synchronousImage.status, 'succeeded');
  assert.equal(jobs.isGenerationJobReady(synchronousImage), true);

  const missingImage = jobs.normalizeSynchronousImageJob({ id: 'image-2' });
  assert.equal(missingImage.status, 'failed');
  assert.equal(jobs.isGenerationJobReady(missingImage), false);

  console.log('Generation job normalization tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
