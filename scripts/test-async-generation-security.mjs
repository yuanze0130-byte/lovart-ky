import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const [
  upscaleSubmit,
  upscaleStatus,
  motionSubmit,
  motionStatus,
  asyncJobs,
  runningHub,
  upscaleLibrary,
  aiSafety,
  migration,
] = await Promise.all([
  read('src/app/api/upscale/route.ts'),
  read('src/app/api/upscale-status/route.ts'),
  read('src/app/api/motion-transfer/route.ts'),
  read('src/app/api/motion-transfer/status/route.ts'),
  read('src/lib/async-generation-jobs.ts'),
  read('src/lib/runninghub.ts'),
  read('src/lib/upscale.ts'),
  read('src/lib/ai-safety.ts'),
  read('sql/async-generation-jobs.sql'),
]);

assert.ok(
  upscaleSubmit.indexOf('await createAsyncGenerationJob') < upscaleSubmit.indexOf('await runMeteredAiOperation')
    && upscaleSubmit.indexOf('await runMeteredAiOperation') < upscaleSubmit.indexOf('await submitUpscaleTask'),
  'upscale ownership must be persisted before upstream submission',
);

assert.ok(
  motionSubmit.indexOf('await createAsyncGenerationJob') < motionSubmit.indexOf('await runMeteredAiOperation')
    && motionSubmit.indexOf('await runMeteredAiOperation') < motionSubmit.indexOf('await fetch(endpoint'),
  'motion-transfer ownership must be persisted before upstream submission',
);

for (const [name, source, upstreamMarker] of [
  ['upscale', upscaleStatus, 'await queryUpscaleTask'],
  ['motion-transfer', motionStatus, 'await fetch(endpoint'],
]) {
  assert.match(source, /enforceUserRateLimit\(user\.id/);
  assert.match(source, /findOwnedAsyncGenerationJob\([\s\S]*userId: user\.id/);
  assert.match(source, /if \(!job\)[\s\S]*status: 404/);
  assert.ok(
    source.indexOf('findOwnedAsyncGenerationJob') < source.indexOf(upstreamMarker),
    `${name} must verify ownership before querying upstream`,
  );
  assert.match(source, /request\.signal/);
  assert.match(source, /settleAsyncGenerationJob/);
  assert.match(source, /findAsyncGenerationJobByRequest/);
  assert.match(source, /requestId/);
}

assert.match(asyncJobs, /\.eq\('user_id', params\.userId\)/);
assert.match(asyncJobs, /\.eq\('kind', params\.kind\)/);
assert.match(asyncJobs, /\.eq\('task_id', params\.taskId\)/);
assert.match(asyncJobs, /settle_async_generation_job_atomic/);
assert.match(asyncJobs, /p_refund: params\.refund \?\? true/);
assert.match(asyncJobs, /class AsyncGenerationTaskBindingError/);
assert.match(asyncJobs, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
assert.match(asyncJobs, /\.contains\('meta', \{ recoveryTaskId: params\.taskId \}\)/);
assert.match(aiSafety, /shouldRefundOnError\?: \(error: unknown\) => boolean/);
assert.match(aiSafety, /params\.shouldRefundOnError\?\.\(error\) \?\? true/);
for (const source of [upscaleSubmit, motionSubmit]) {
  assert.match(source, /shouldRefundOnError/);
  assert.match(source, /isAbortOrTimeoutError/);
  assert.match(source, /isLikelyTransportError/);
  assert.match(source, /fetch failed\|network\|socket\|connection reset/);
  assert.match(source, /refund: !upstreamOutcomeUnknown/);
  assert.match(source, /UPSTREAM_OUTCOME_UNKNOWN/);
  assert.match(source, /upstreamSubmissionStarted &&/);
  assert.match(source, /X-Doodleverse-Recoverable-Task-Id/);
  assert.match(source, /recoveryTaskId/);
}
assert.match(upscaleLibrary, /signal\?\.throwIfAborted\(\);\s+onSubmissionStart\?\.\(\);\s+const submitResult/);
assert.match(upscaleSubmit, /submitUpscaleTask\([\s\S]*upstreamSubmissionStarted = true/);
assert.match(motionSubmit, /request\.signal\.throwIfAborted\(\);\s+upstreamSubmissionStarted = true;\s+const response = await fetch/);
assert.match(runningHub, /queryRunningHubTask\([\s\S]*signal\?: AbortSignal/);
assert.match(runningHub, /body: JSON\.stringify\(\{ taskId \}\),[\s\S]*signal/);

assert.match(migration, /unique index[\s\S]*\(kind, task_id\)/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all[\s\S]*anon, authenticated/i);
assert.match(migration, /grant select, insert, update, delete[\s\S]*service_role/i);
assert.match(migration, /for update/i);
assert.match(migration, /refund_credits_atomic/i);
assert.match(migration, /security invoker/i);
assert.match(migration, /ASYNC_JOB_TERMINAL_CONFLICT/);
assert.match(migration, /ORIGINAL_DEBIT_NOT_FOUND/);
assert.match(migration, /p_refund boolean default true/i);
assert.match(migration, /outcome_unknown remains recoverable/i);
assert.match(migration, /meta = meta \|\| coalesce\(p_meta/);
assert.match(migration, /revoke all on function[\s\S]*anon, authenticated/i);

console.log('Async generation ownership and settlement guard tests passed.');
