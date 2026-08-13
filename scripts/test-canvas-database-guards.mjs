import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sql = await readFile(
  path.join(process.cwd(), 'sql', 'public-beta-canvas-quotas.sql'),
  'utf8',
);

assert.match(sql, /octet_length\(element_data::text\) <= 131072/);
assert.match(sql, /element_data::text !~\* 'data:\(image\|video\)\/'/);
assert.match(sql, /v_project_count > 50/);
assert.match(sql, /v_element_count > 2000/);
assert.match(sql, /v_element_count > 5000/);
assert.match(sql, /v_element_bytes > 67108864/);
assert.match(sql, /after insert on public\.canvas_elements/);
assert.match(sql, /after update on public\.canvas_elements/);
assert.match(sql, /to authenticated/);
assert.match(sql, /revoke all on table public\.projects, public\.canvas_elements from anon, authenticated/);

console.log('Canvas database guard tests passed.');
