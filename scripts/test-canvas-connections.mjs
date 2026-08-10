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
  const {
    getCreateMenuNodeDefinitions,
    getNodeDefaultState,
    getNodeTypeForQdmyImport,
    getQdmyExportType,
    listNodeDefinitions,
  } = await import(`${pathToFileURL(definitionsOutputPath).href}?v=${Date.now()}`);

  const definitions = listNodeDefinitions();
  assert.deepEqual(definitions.map((definition) => definition.type).sort(), [
    'connector', 'image', 'image-compare', 'image-generator', 'inpaint',
    'path', 'shape', 'text', 'video', 'video-generator',
  ]);
  assert.deepEqual(getCreateMenuNodeDefinitions().map((definition) => definition.type), [
    'image-generator', 'video-generator', 'image-compare', 'inpaint',
  ]);
  assert.equal(getNodeDefaultState('image-compare').imageCompareSplit, 50);
  assert.equal(getNodeDefaultState('inpaint').inpaintFeather, 4);
  assert.equal(getNodeTypeForQdmyImport('custom-agent'), 'text');
  assert.equal(getNodeTypeForQdmyImport('comfy-ui'), 'image-generator');
  assert.equal(getNodeTypeForQdmyImport('gen-music'), 'text');
  assert.equal(getNodeTypeForQdmyImport('gen-speech'), 'text');
  assert.equal(getQdmyExportType('image-compare'), 'image-compare');
  assert.equal(getQdmyExportType('inpaint'), 'inpaint-menu');

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

  const secondTextNode = { id: 'prompt-2', type: 'text', x: 0, y: 200, content: 'warm sunset lighting' };
  const orderedPromptEdges = [
    {
      id: 'edge-prompt-2', type: 'connector', x: 0, y: 0,
      connectorFrom: 'prompt-2', connectorTo: 'generator',
      connectorSourcePort: 'prompt-out', connectorTargetPort: 'prompt-in', connectorOrder: 0,
    },
    { ...migratedPromptEdge, connectorOrder: 1 },
  ];
  const combinedInputs = resolveConnectedInputs('generator', [textNode, secondTextNode, generator, ...orderedPromptEdges]);
  assert.equal(combinedInputs.prompt, 'warm sunset lighting\n\ncinematic portrait');

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
