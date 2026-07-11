import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-connections');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-connections.ts');
const definitionsSourcePath = path.join(root, 'src', 'lib', 'node-definitions.ts');
const outputPath = path.join(tempDir, 'canvas-connections.mjs');
const definitionsOutputPath = path.join(tempDir, 'node-definitions.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const definitionsSource = await readFile(definitionsSourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
const definitionsTranspiled = ts.transpileModule(definitionsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: definitionsSourcePath,
});
await writeFile(definitionsOutputPath, definitionsTranspiled.outputText, 'utf8');
await writeFile(outputPath, transpiled.outputText.replace(/from ['"]@\/lib\/node-definitions['"]/, "from './node-definitions.mjs'"), 'utf8');

try {
  const {
    canConnectPorts,
    getNodePorts,
    normalizeCanvasConnections,
    resolveConnectedInputs,
    wouldCreateConnectionCycle,
  } = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
  const { getCreateMenuNodeDefinitions, listNodeDefinitions } = await import(`${pathToFileURL(definitionsOutputPath).href}?v=${Date.now()}`);

  const definitions = listNodeDefinitions();
  assert.ok(definitions.length >= 10, 'all current canvas node types should be registered');
  assert.deepEqual(getCreateMenuNodeDefinitions().map((definition) => definition.type), [
    'image-generator', 'video-generator', 'image-compare', 'inpaint',
  ]);

  const textNode = { id: 'prompt', type: 'text', x: 0, y: 0, content: 'cinematic portrait' };
  const imageNode = { id: 'reference', type: 'image', x: 0, y: 100, content: 'data:image/png;base64,abc' };
  const generator = { id: 'generator', type: 'image-generator', x: 300, y: 0 };
  const legacyPromptEdge = { id: 'edge-prompt', type: 'connector', x: 0, y: 0, connectorFrom: 'prompt', connectorTo: 'generator' };
  const referenceEdge = {
    id: 'edge-reference', type: 'connector', x: 0, y: 0,
    connectorFrom: 'reference', connectorTo: 'generator',
    connectorSourcePort: 'image-out', connectorTargetPort: 'reference-in', connectorOrder: 1,
  };
  const elements = [textNode, imageNode, generator, legacyPromptEdge, referenceEdge];

  const normalized = normalizeCanvasConnections(elements);
  const migratedPromptEdge = normalized.find((item) => item.id === 'edge-prompt');
  assert.equal(migratedPromptEdge.connectorSourcePort, 'prompt-out');
  assert.equal(migratedPromptEdge.connectorTargetPort, 'prompt-in');
  assert.equal(migratedPromptEdge.connectorKind, 'prompt');

  const inputs = resolveConnectedInputs('generator', normalized);
  assert.equal(inputs.prompt, 'cinematic portrait');
  assert.deepEqual(inputs.references, ['data:image/png;base64,abc']);

  const imageOutput = getNodePorts(imageNode).find((port) => port.id === 'image-out');
  const referenceInput = getNodePorts(generator).find((port) => port.id === 'reference-in');
  assert.equal(canConnectPorts(imageOutput, referenceInput), true);
  const compareNode = { id: 'compare', type: 'image-compare', x: 600, y: 0 };
  assert.equal(getNodePorts(compareNode).filter((port) => port.direction === 'input').length, 2);
  assert.equal(canConnectPorts(imageOutput, getNodePorts(compareNode).find((port) => port.id === 'compare-a-in')), true);
  const inpaintNode = { id: 'inpaint', type: 'inpaint', x: 900, y: 0 };
  assert.equal(getNodePorts(inpaintNode).some((port) => port.id === 'image-in'), true);
  assert.equal(wouldCreateConnectionCycle(normalized, 'generator', 'prompt'), true);
  assert.equal(wouldCreateConnectionCycle(normalized, 'prompt', 'reference'), false);

  console.log('Canvas connection tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
