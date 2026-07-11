import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-tests', 'canvas-connections');
const sourcePath = path.join(root, 'src', 'lib', 'canvas-connections.ts');
const outputPath = path.join(tempDir, 'canvas-connections.mjs');
await mkdir(tempDir, { recursive: true });

const source = await readFile(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
});
await writeFile(outputPath, transpiled.outputText, 'utf8');

try {
  const {
    canConnectPorts,
    getNodePorts,
    normalizeCanvasConnections,
    resolveConnectedInputs,
    wouldCreateConnectionCycle,
  } = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

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
  assert.equal(wouldCreateConnectionCycle(normalized, 'generator', 'prompt'), true);
  assert.equal(wouldCreateConnectionCycle(normalized, 'prompt', 'reference'), false);

  console.log('Canvas connection tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
