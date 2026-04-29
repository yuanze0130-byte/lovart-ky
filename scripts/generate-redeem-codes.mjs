import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const count = Number(process.argv[2] || 10);
const prefix = String(process.argv[3] || 'LVRT').toUpperCase().replace(/[^A-Z0-9]/g, '');
const outPath = process.argv[4] || path.join(process.cwd(), 'redeem-codes.csv');

if (!Number.isFinite(count) || count <= 0) {
  console.error('Usage: node scripts/generate-redeem-codes.mjs <count> [prefix] [outPath]');
  process.exit(1);
}

function randomChunk(length) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function buildCode() {
  return [prefix, randomChunk(4), randomChunk(4), randomChunk(4)].join('-');
}

function normalizeCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCode(normalizedCode) {
  return crypto.createHash('sha256').update(normalizedCode).digest('hex');
}

function maskCode(code) {
  const normalized = normalizeCode(code);
  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
}

const rows = [];
const seen = new Set();
while (rows.length < count) {
  const code = buildCode();
  const normalized = normalizeCode(code);
  if (seen.has(normalized)) continue;
  seen.add(normalized);
  rows.push({
    code,
    code_hash: hashCode(normalized),
    code_mask: maskCode(code),
  });
}

const csv = ['code,code_hash,code_mask', ...rows.map((row) => `${row.code},${row.code_hash},${row.code_mask}`)].join('\n');
fs.writeFileSync(outPath, csv, 'utf8');
console.log(`Generated ${rows.length} redeem codes -> ${outPath}`);
