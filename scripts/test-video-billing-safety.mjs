import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const [submit, status, ledger, types] = await Promise.all([
  read('src/app/api/generate-video/route.ts'),
  read('src/app/api/video-status/route.ts'),
  read('sql/video-credit-ledger.sql'),
  read('src/lib/supabase.ts'),
]);

assert.doesNotMatch(submit, /import \{ consumeCredits, refundCredits \}/);
assert.match(submit, /class VideoUpstreamOutcomeUnknownError/);
assert.match(submit, /VIDEO_UPSTREAM_OUTCOME_UNKNOWN/);
assert.match(submit, /VIDEO_TASK_BINDING_FAILED/);
assert.match(submit, /if \(request\.signal\.aborted\)[\s\S]*upstreamStarted = true/);
assert.match(submit, /catch \(fetchError\)[\s\S]*isAbortOrTransportError/);
assert.match(submit, /status: upstreamOutcomeUnknown \? 'outcome_unknown' : 'failed'/);
assert.match(submit, /refundedCredits: 0/);
assert.match(submit, /X-Doodleverse-Recoverable-Task-Id/);

assert.match(submit, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
assert.match(submit, /\.is\('task_id', null\)/);
assert.match(submit, /existing\?\.task_id === params\.taskId/);
assert.doesNotMatch(submit, /if \(taskUpdateError\) console\.error/);
assert.ok(
  submit.indexOf('await bindVideoTaskWithRetry') < submit.indexOf('return NextResponse.json({\n      requestId'),
  'the route must persist the task id before returning success',
);

assert.match(status, /\.eq\('task_id', taskId\)[\s\S]*\.eq\('user_id', user\.id\)/);
assert.match(status, /if \(!billingJob\)[\s\S]*status: 404/);
assert.ok(
  status.indexOf('if (!billingJob)') < status.indexOf('await fetch('),
  'ownership must be checked before querying the upstream status API',
);
assert.match(status, /signal: request\.signal/);
assert.match(status, /jobStatus === 'failed' \|\| jobStatus === 'cancelled'/);
assert.match(status, /settle_video_generation_job_atomic/);
assert.doesNotMatch(status, /refundCredits/);

assert.match(ledger, /settle_video_generation_job_atomic/);
assert.match(ledger, /for update/i);
assert.match(ledger, /refund_credits_atomic/i);
assert.match(ledger, /p_terminal_status in \('failed', 'cancelled'\)/i);
assert.match(ledger, /outcome_unknown is deliberately recoverable/i);
assert.match(ledger, /VIDEO_JOB_TERMINAL_CONFLICT/);
assert.match(ledger, /revoke all on function public\.settle_video_generation_job_atomic[\s\S]*public, anon, authenticated/i);
assert.match(ledger, /grant execute on function public\.settle_video_generation_job_atomic[\s\S]*service_role/i);
assert.match(types, /settle_video_generation_job_atomic/);

console.log('Video billing handoff and settlement guard tests passed.');
