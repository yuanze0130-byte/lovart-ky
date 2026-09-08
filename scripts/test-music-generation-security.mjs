import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const submit = await readFile('src/app/api/generate-music/route.ts', 'utf8');
const status = await readFile('src/app/api/generate-music/status/route.ts', 'utf8');
const jobs = await readFile('src/lib/async-generation-jobs.ts', 'utf8');
const migration = await readFile('sql/async-generation-jobs.sql', 'utf8');

assert.match(submit, /requireUser\(request\)/);
assert.match(submit, /enforceUserRateLimit\(user\.id, 'canvas-music'/);
assert.match(submit, /expectedCredits !== quote\.credits/);
assert.match(submit, /creditType: 'generate_music'/);
assert.match(submit, /createAsyncGenerationJob/);
assert.match(submit, /bindAsyncGenerationTask/);
assert.match(submit, /\/suno\/submit\/music/);
assert.match(status, /findOwnedAsyncGenerationJob/);
assert.match(status, /userId: user\.id, kind: 'music'/);
assert.match(status, /settleAsyncGenerationJob/);
assert.match(status, /\/suno\/fetch\//);
assert.match(jobs, /'upscale' \| 'motion_transfer' \| 'music'/);
assert.match(migration, /'upscale', 'motion_transfer', 'music'/);

console.log('Music generation ownership, pricing, and settlement guards passed.');
