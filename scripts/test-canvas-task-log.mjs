import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-task-log');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-task-log.ts');
const outputPath = path.join(tempDir, 'canvas-task-log.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const taskLog = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  const started = taskLog.upsertCanvasTaskLogEntries([], {
    id: 'task-1',
    nodeId: 'node-1',
    kind: 'image',
    status: 'running',
    progress: 18,
    message: '图片任务已提交',
    promptPreview: 'a'.repeat(400),
  }, 'project-1', '2026-09-01T00:00:00.000Z');

  assert.equal(started.length, 1);
  assert.equal(started[0].projectId, 'project-1');
  assert.equal(started[0].progress, 18);
  assert.equal(started[0].promptPreview.length, 300);
  assert.equal(started[0].level, 'info');

  const completed = taskLog.upsertCanvasTaskLogEntries(started, {
    id: 'task-1',
    taskId: 'upstream-1',
    kind: 'image',
    status: 'succeeded',
    progress: 88,
    message: '图片生成完成',
    provider: 'proxy',
  }, 'project-1', '2026-09-01T00:01:00.000Z');

  assert.equal(completed.length, 1);
  assert.equal(completed[0].progress, 100);
  assert.equal(completed[0].taskId, 'upstream-1');
  assert.equal(completed[0].nodeId, 'node-1');
  assert.equal(completed[0].completedAt, '2026-09-01T00:01:00.000Z');

  const serverRow = taskLog.canvasTaskLogEntryToServerRow(completed[0], 'user-1');
  assert.equal(serverRow.user_id, 'user-1');
  assert.equal(serverRow.project_id, 'project-1');
  assert.deepEqual(taskLog.canvasTaskLogServerRowToEntry(serverRow), completed[0]);

  const mergedCollections = taskLog.mergeCanvasTaskLogCollections(started, completed);
  assert.equal(mergedCollections.length, 1);
  assert.equal(mergedCollections[0].status, 'succeeded');

  const failed = taskLog.mergeCanvasTaskLogEntry(undefined, {
    id: 'task-2',
    kind: 'video',
    status: 'failed',
    progress: -5,
    message: '视频生成失败',
    error: 'timeout',
  }, null, '2026-09-01T00:02:00.000Z');
  assert.equal(failed.progress, 0);
  assert.equal(failed.level, 'error');
  assert.equal(failed.projectId, 'local');

  const many = Array.from({ length: 205 }, (_, index) => ({
    ...failed,
    id: `task-${index}`,
    updatedAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
  }));
  const limited = taskLog.upsertCanvasTaskLogEntries(many, {
    id: 'latest',
    kind: 'analysis',
    status: 'queued',
    message: '最新任务',
  }, 'project-1', '2026-09-02T00:00:00.000Z');
  assert.equal(limited.length, taskLog.MAX_CANVAS_TASK_LOG_ENTRIES);
  assert.equal(limited[0].id, 'latest');

  console.log('Canvas task log tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
