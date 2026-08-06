import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const applyChanges = process.argv.includes('--apply');
const assetRoot = path.resolve(process.env.CANVAS_ASSET_DIR || '/www/storage/doodleverse/canvas');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.resolve(
  process.env.CANVAS_MIGRATION_BACKUP_DIR
    || path.join(path.dirname(assetRoot), 'migration-backups', timestamp)
);

function loadEnvironmentFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvironmentFile('.env.production');
loadEnvironmentFile('.env.local');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function decodeInlineImage(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  return { declaredType: match[1].toLowerCase(), bytes: Buffer.from(match[2], 'base64') };
}

function detectImage(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'GIF8') {
    return { extension: 'gif', contentType: 'image/gif' };
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  const fileType = bytes.subarray(4, 12).toString('ascii');
  if (fileType === 'ftypavif' || fileType === 'ftypavis') {
    return { extension: 'avif', contentType: 'image/avif' };
  }
  return null;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function storeImage(userId, bytes) {
  const image = detectImage(bytes);
  if (!image) throw new Error('Unsupported inline image format');

  const digest = createHash('sha256').update(bytes).digest('hex');
  const fileName = `${digest}.${image.extension}`;
  const userDirectory = path.join(assetRoot, userId);
  const targetPath = path.join(userDirectory, fileName);

  if (applyChanges && !(await fileExists(targetPath))) {
    await mkdir(userDirectory, { recursive: true, mode: 0o755 });
    const temporaryPath = path.join(userDirectory, `.${fileName}.${randomUUID()}.tmp`);
    await writeFile(temporaryPath, bytes, { mode: 0o644, flag: 'wx' });
    await rename(temporaryPath, targetPath);
  }

  return `/media/canvas/${userId}/${fileName}`;
}

async function persistInlineImages(value, userId, stats) {
  const inlineImage = decodeInlineImage(value);
  if (inlineImage) {
    stats.images += 1;
    stats.bytes += inlineImage.bytes.byteLength;
    return storeImage(userId, inlineImage.bytes);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const nextValue = [];
    for (const entry of value) {
      const migrated = await persistInlineImages(entry, userId, stats);
      changed ||= migrated !== entry;
      nextValue.push(migrated);
    }
    return changed ? nextValue : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const nextValue = {};
    for (const [key, entry] of Object.entries(value)) {
      const migrated = await persistInlineImages(entry, userId, stats);
      changed ||= migrated !== entry;
      nextValue[key] = migrated;
    }
    return changed ? nextValue : value;
  }
  return value;
}

async function writeBackup(kind, id, payload) {
  if (!applyChanges) return;
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload)));
  await writeFile(path.join(backupRoot, `${kind}-${id}.json.gz`), compressed, { mode: 0o600 });
}

async function listAll(table, columns) {
  const rows = [];
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

const projects = await listAll('projects', 'id,user_id,thumbnail');
const projectById = new Map(projects.map((project) => [project.id, project]));
const canvasRows = await listAll('canvas_elements', 'id,project_id');
const totals = { images: 0, bytes: 0, rows: 0, thumbnails: 0 };

console.log(`${applyChanges ? 'APPLY' : 'DRY RUN'}: inspecting ${canvasRows.length} canvas rows`);

for (const rowSummary of canvasRows) {
  const project = projectById.get(rowSummary.project_id);
  if (!project?.user_id) {
    console.warn(`Skipping canvas row ${rowSummary.id}: project owner not found`);
    continue;
  }

  const { data: row, error } = await supabase
    .from('canvas_elements')
    .select('id,project_id,element_data')
    .eq('id', rowSummary.id)
    .single();
  if (error) throw new Error(`Unable to read canvas row ${rowSummary.id}: ${error.message}`);

  const rowStats = { images: 0, bytes: 0 };
  const elementData = await persistInlineImages(row.element_data, project.user_id, rowStats);
  if (elementData === row.element_data) continue;

  totals.images += rowStats.images;
  totals.bytes += rowStats.bytes;
  totals.rows += 1;
  console.log(`canvas ${row.id}: ${rowStats.images} image(s), ${(rowStats.bytes / 1024 / 1024).toFixed(2)} MB`);

  if (applyChanges) {
    await writeBackup('canvas', row.id, row);
    const { error: updateError } = await supabase
      .from('canvas_elements')
      .update({ element_data: elementData })
      .eq('id', row.id);
    if (updateError) throw new Error(`Unable to update canvas row ${row.id}: ${updateError.message}`);
  }
}

for (const project of projects) {
  if (!project.user_id || !decodeInlineImage(project.thumbnail)) continue;
  const thumbnailStats = { images: 0, bytes: 0 };
  const thumbnail = await persistInlineImages(project.thumbnail, project.user_id, thumbnailStats);
  totals.images += thumbnailStats.images;
  totals.bytes += thumbnailStats.bytes;
  totals.thumbnails += 1;

  if (applyChanges) {
    await writeBackup('project', project.id, project);
    const { error } = await supabase.from('projects').update({ thumbnail }).eq('id', project.id);
    if (error) throw new Error(`Unable to update project thumbnail ${project.id}: ${error.message}`);
  }
}

if (applyChanges) {
  await writeFile(path.join(backupRoot, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), totals }, null, 2), { mode: 0o600 });
}

console.log(JSON.stringify({ mode: applyChanges ? 'apply' : 'dry-run', assetRoot, backupRoot, ...totals }, null, 2));
