import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'doodleverse-comfly-sync-'));
const dataDir = path.join(tempDir, '.local-data');
const sourceDir = path.join(tempDir, 'src', 'lib');
const imagePath = path.join(sourceDir, 'image-pricing.ts');
const videoPath = path.join(sourceDir, 'video-pricing.ts');

function run(snapshotPath, extraArgs = []) {
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts', 'sync-comfly-pricing.mjs'), `--snapshot=${snapshotPath}`, '--apply', ...extraArgs], {
    cwd: tempDir, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

try {
  await mkdir(dataDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  await writeFile(imagePath, `export const IMAGE_PRICE_VERSION = 'baseline';
const FIXED_COSTS = {
  'nano-banana': { costUnits: 16_000, group: 'gemini-premium' },
};
`);
  await writeFile(videoPath, `export const VIDEO_PRICE_VERSION = 'baseline';
const WAN_26_COSTS = {
};
const KLING_26_COSTS = {
};
const KLING_25_TURBO_COSTS = {
};
const HAILUO_COSTS = {
  'MiniMax-Hailuo-2.3': {
  },
  'MiniMax-Hailuo-2.3-Fast': {
  },
  'MiniMax-Hailuo-02': {
  },
};
`);
  const originalImage = await readFile(imagePath, 'utf8');
  const baseline = {
    version: 'a'.repeat(32),
    group_ratio: { default: 1, 'gemini优质': 2 },
    records: [
      { model_name: 'nano-banana', quota_type: 1, model_price: 0.08, enable_groups: ['gemini优质'] },
      ...Array.from({ length: 100 }, (_, index) => ({ model_name: `unused-${index}`, quota_type: 0, model_price: 0 })),
    ],
  };
  const modified = structuredClone(baseline);
  const nanoBanana = modified.records.find((record) => record.model_name === 'nano-banana');
  assert.equal(nanoBanana?.model_price, 0.08);
  nanoBanana.model_price = 0.088;
  const snapshotPath = path.join(tempDir, 'changed-catalog.json');
  await writeFile(snapshotPath, JSON.stringify(modified));
  await writeFile(path.join(dataDir, 'comfly-pricing.json'), JSON.stringify(baseline));
  await writeFile(path.join(dataDir, 'comfly-pricing-report.json'), JSON.stringify({ version: baseline.version, skipped: [] }));

  const first = run(snapshotPath);
  assert.equal(first.catalogChanged, true);
  assert.equal(first.versionChanged, false);
  assert.equal(first.manualReviewRequired, true);
  assert.deepEqual(first.changes, []);
  assert.equal(first.blockedChanges.some((change) => change.model === 'nano-banana'), true);
  assert.equal(await readFile(imagePath, 'utf8'), originalImage);

  const second = run(snapshotPath);
  assert.equal(second.catalogChanged, false);
  assert.equal(second.manualReviewRequired, true);
  assert.deepEqual(second.changes, []);
  assert.equal(second.blockedChanges.some((change) => change.model === 'nano-banana'), true);
  assert.equal(second.skippedChanged, false);
  assert.equal(await readFile(imagePath, 'utf8'), originalImage);

  const accepted = run(snapshotPath, ['--accept-version-mismatch']);
  assert.equal(accepted.manualReviewRequired, false);
  assert.equal(accepted.changes.some((change) => change.model === 'nano-banana'), true);
  assert.notEqual(await readFile(imagePath, 'utf8'), originalImage);
  console.log('Comfly pricing sync safety tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
