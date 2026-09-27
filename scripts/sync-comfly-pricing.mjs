import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const apply = process.argv.includes('--apply');
const snapshot = process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice(11);
const endpoint = process.env.COMFLY_PRICING_URL || 'https://ai.comfly.org/api/pricing';
const payload = snapshot
  ? JSON.parse(await fs.readFile(snapshot, 'utf8'))
  : await (async () => {
    const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Comfly pricing HTTP ${response.status}`);
    return response.json();
  })();
const records = payload.records || payload.data;
const version = String(payload.version || payload._ || '');
if (!Array.isArray(records) || records.length < 100 || !/^[a-f0-9]{32}$/.test(version)) {
  throw new Error('Comfly pricing response is incomplete');
}
const byName = new Map(records.map((record) => [record.model_name, record]));
const groupRatios = payload.group_ratio || { default: 1, 'gemini优质': 2, '国产特价': 0.7 };
const imageGroups = { default: 'default', 'gemini-premium': 'gemini优质', 'domestic-special': '国产特价' };
const report = { version, checkedAt: new Date().toISOString(), changes: [], skipped: [] };
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function quotedCost(model, key, rowKey, group = 'default') {
  const record = byName.get(model);
  if (!record || record.quota_type !== 1 || !Number.isFinite(record.model_price) || record.model_price <= 0) {
    report.skipped.push({ model, key, reason: 'No fixed per-request price' });
    return null;
  }
  let ratio = 1;
  if (rowKey) {
    const data = record.other_info?.ratios;
    const matches = (data?.rows || []).flatMap((row, index) =>
      row.map((part) => String(part).toLowerCase().replace(/\s+/g, '')).join('|') === rowKey
        ? [Number(data.ratios[index])] : []);
    if (matches.length !== 1 || !Number.isFinite(matches[0]) || matches[0] <= 0) {
      report.skipped.push({ model, key, reason: `Unmapped specification: ${rowKey}` });
      return null;
    }
    ratio = matches[0];
  }
  const groupRatio = Number(groupRatios[group]);
  if (!record.enable_groups?.includes(group) || !Number.isFinite(groupRatio) || groupRatio <= 0) {
    report.skipped.push({ model, key, reason: `Unavailable or unpriced group: ${group}` });
    return null;
  }
  return Math.round(record.model_price * ratio * groupRatio * 100_000);
}

function update(source, model, key, value, pattern) {
  if (value === null) return source;
  const match = source.match(pattern);
  if (!match) throw new Error(`Source entry missing: ${model} ${key}`);
  const current = Number(match[2].replaceAll('_', ''));
  if (current === value) return source;
  if (Math.abs(value / current - 1) > 0.2) {
    report.skipped.push({ model, key, current, proposed: value, reason: 'Change exceeds 20%; review required' });
    return source;
  }
  report.changes.push({ model, key, current, proposed: value });
  return source.replace(pattern, (_, before, _old, after) => `${before}${value.toLocaleString('en-US').replaceAll(',', '_')}${after}`);
}

const imagePath = path.join(root, 'src/lib/image-pricing.ts');
const videoPath = path.join(root, 'src/lib/video-pricing.ts');
let image = await fs.readFile(imagePath, 'utf8');
let video = await fs.readFile(videoPath, 'utf8');
const imageTable = image.match(/const FIXED_COSTS[^=]*= \{([\s\S]*?)\n\};/);
if (!imageTable) throw new Error('Image pricing table missing');
for (const [, model, group] of imageTable[1].matchAll(/'([^']+)': \{ costUnits: \d[\d_]*, group: '([^']+)'/g)) {
  if (model.startsWith('gpt-image-2.5-')) {
    report.skipped.push({ model, reason: 'Conflicting fixed and token-based prices require review' });
    continue;
  }
  image = update(image, model, model, quotedCost(model, model, null, imageGroups[group]), new RegExp(`('${esc(model)}': \\{ costUnits: )(\\d[\\d_]*)(, group:)`));
}

const videoTables = [
  ['WAN_26_COSTS', 'wan2.6-i2v', (key) => { const [resolution, seconds] = key.split(':'); return `${resolution}|${seconds}秒`; }],
  ['KLING_26_COSTS', 'kling-video-v2-6', (key) => { const [, audio, seconds] = key.split(':'); return `pro|${audio === 'true' ? '有声' : '无声'}|${seconds}s`; }],
  ['KLING_25_TURBO_COSTS', 'kling-video-v2-5-turbo', (key) => { const [mode, seconds] = key.split(':'); return `${mode}|${seconds}s`; }],
];
for (const [table, model, rowKey] of videoTables) {
  const block = video.match(new RegExp(`const ${table}[^=]*= \\{([\\s\\S]*?)\\n\\};`));
  if (!block) throw new Error(`${table} missing`);
  for (const [, key] of block[1].matchAll(/'([^']+)': \d[\d_]*/g)) {
    video = update(video, model, key, quotedCost(model, key, rowKey(key)), new RegExp(`('${esc(key)}': )(\\d[\\d_]*)(,)`));
  }
}
for (const model of ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'MiniMax-Hailuo-02']) {
  const block = video.match(new RegExp(`'${esc(model)}': \\{([\\s\\S]*?)\\n  \\},`));
  if (!block) throw new Error(`Hailuo table missing: ${model}`);
  for (const [, key] of block[1].matchAll(/'([^']+)': \d[\d_]*/g)) {
    const [resolution, seconds] = key.split(':');
    const pattern = new RegExp(`('${esc(model)}': \\{[\\s\\S]*?'${esc(key)}': )(\\d[\\d_]*)(,)`);
    video = update(video, model, key, quotedCost(model, key, `${resolution}|${seconds}`), pattern);
  }
}

if (report.changes.length) {
  image = image.replace(/export const IMAGE_PRICE_VERSION = '[^']+';/, `export const IMAGE_PRICE_VERSION = 'comfly-api-${version}';`);
  video = video.replace(/export const VIDEO_PRICE_VERSION = '[^']+';/, `export const VIDEO_PRICE_VERSION = 'comfly-api-${version}';`);
}
console.log(JSON.stringify(report, null, 2));
if (apply) {
  const dataDir = path.join(root, '.local-data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'comfly-pricing-report.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(dataDir, 'comfly-pricing.json'), JSON.stringify({ endpoint, version, fetchedAt: report.checkedAt, group_ratio: groupRatios, records }, null, 2) + '\n');
  if (report.changes.length) {
    await fs.writeFile(imagePath, image);
    await fs.writeFile(videoPath, video);
  }
}
