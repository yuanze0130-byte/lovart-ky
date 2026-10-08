import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = await readFile('src/lib/image-gateway-routing.ts', 'utf8');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'doodleverse-image-gateway-'));
const outputPath = path.join(tempDir, 'routing.mjs');

try {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  await writeFile(outputPath, compiled.outputText);
  const routing = await import(pathToFileURL(outputPath).href);
  const env = {
    CANVAS_GATEWAY_DEFAULT_API_KEY: 'default-key',
    CANVAS_GATEWAY_GEMINI_PREMIUM_API_KEY: 'gemini-key',
    CANVAS_GATEWAY_DOMESTIC_SPECIAL_API_KEY: 'domestic-key',
    CANVAS_GATEWAY_GPT_IMAGE_BACKUP_API_KEY: 'backup-key',
  };

  assert.equal(routing.imageGatewayKeyForGroup('default', env), 'default-key');
  assert.equal(routing.imageGatewayKeyForGroup('gemini-premium', env), 'gemini-key');
  assert.equal(routing.imageGatewayKeyForGroup('domestic-special', env), 'domestic-key');
  assert.equal(routing.imageGatewayKeyForGroup('gemini-premium', { ...env, CANVAS_GATEWAY_GEMINI_PREMIUM_API_KEY: '' }), '');
  assert.equal(routing.isDoodleverseGateway('https://doodleverse.fun/v1'), true);
  assert.equal(routing.isDoodleverseGateway('https://ai.comfly.org/v1'), false);
  assert.equal(routing.gptImageBackupKeyForModel('gpt-image-2.5-flare', 'default', env), 'backup-key');
  assert.equal(routing.gptImageBackupKeyForModel('gpt-image-2.5-sunburst', 'default', env), 'backup-key');
  assert.equal(routing.gptImageBackupKeyForModel('gpt-image-2', 'default', env), undefined);
  assert.equal(routing.gptImageBackupKeyForModel('gpt-image-2.5-flare', 'gemini-premium', env), undefined);
  assert.equal(routing.isGatewayPreDispatchFailure('{"error":{"code":"get_channel_failed"}}'), true);
  assert.equal(routing.isGatewayPreDispatchFailure('{"error":{"code":"upstream_error"}}'), false);
  console.log('Image gateway routing tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
