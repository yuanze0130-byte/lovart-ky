import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sql = await readFile(path.join(process.cwd(), 'sql', 'canvas-task-logs.sql'), 'utf8');

assert.match(sql, /ALTER TABLE public\.canvas_task_logs ENABLE ROW LEVEL SECURITY/i);
assert.match(sql, /TO authenticated[\s\S]*user_id = \(\(SELECT auth\.uid\(\)\)::TEXT\)/i);
assert.match(sql, /FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/i);
assert.match(sql, /REFERENCES public\.projects\(id\) ON DELETE CASCADE/i);
assert.match(sql, /REVOKE ALL ON TABLE public\.canvas_task_logs FROM PUBLIC, anon/i);
assert.match(sql, /PRIMARY KEY \(project_id, id\)/i);

console.log('Canvas task log security tests passed.');
