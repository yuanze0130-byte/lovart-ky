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
    buildBatchConnections,
    buildConnectedNodeContentsIndex,
    canConnectPorts,
    getNodePorts,
    normalizeCanvasConnections,
    resolveConnectedInputs,
    resolveConnectedNodeContents,
    resolveConnectedNodeContentsFromIndex,
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
    'connector', 'global-view', 'image', 'image-compare', 'image-generator', 'inpaint', 'motion-transfer',
    'path', 'script-writer', 'shape', 'table-editor', 'text', 'video', 'video-breakdown', 'video-frames', 'video-generator',
  ]);
  assert.deepEqual(getCreateMenuNodeDefinitions().map((definition) => definition.type), [
    'image-generator', 'video-generator', 'image-compare', 'global-view', 'motion-transfer', 'table-editor', 'video-frames', 'video-breakdown', 'inpaint',
  ]);
  assert.equal(getNodeDefaultState('image-compare').imageCompareSplit, 50);
  assert.equal(getNodeDefaultState('inpaint').inpaintFeather, 4);
  assert.deepEqual(getNodeDefaultState('table-editor').tableColumns, ['#']);
  assert.equal(getNodeDefaultState('video-frames').videoFrameCount, 6);
  assert.equal(getNodeDefaultState('script-writer').scriptDurationMinutes, 3);
  assert.equal(getNodeTypeForQdmyImport('custom-agent'), 'text');
  assert.equal(getNodeTypeForQdmyImport('comfy-ui'), 'image-generator');
  assert.equal(getNodeTypeForQdmyImport('gen-music'), 'text');
  assert.equal(getNodeTypeForQdmyImport('gen-speech'), 'text');
  assert.equal(getQdmyExportType('image-compare'), 'image-compare');
  assert.equal(getQdmyExportType('inpaint'), 'inpaint-menu');
  assert.equal(getNodeTypeForQdmyImport('global-perspective'), 'global-view');
  assert.equal(getNodeTypeForQdmyImport('motion-control'), 'motion-transfer');
  assert.equal(getNodeTypeForQdmyImport('table-editor-node'), 'table-editor');
  assert.equal(getNodeTypeForQdmyImport('video-analyze'), 'video-breakdown');
  assert.equal(getNodeTypeForQdmyImport('storyboard-node'), 'script-writer');

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
  const legacyContentsIndex = buildConnectedNodeContentsIndex(elements);
  assert.deepEqual(
    resolveConnectedNodeContentsFromIndex('generator', 'prompt-in', legacyContentsIndex),
    ['cinematic portrait'],
  );
  assert.deepEqual(
    resolveConnectedNodeContentsFromIndex('generator', 'reference-in', legacyContentsIndex),
    ['data:image/png;base64,abc'],
  );

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

  const connectedContentsElements = [textNode, secondTextNode, generator, ...orderedPromptEdges];
  const connectedContentsIndex = buildConnectedNodeContentsIndex(connectedContentsElements);
  assert.deepEqual(
    resolveConnectedNodeContentsFromIndex('generator', 'prompt-in', connectedContentsIndex),
    ['warm sunset lighting', 'cinematic portrait'],
  );
  assert.deepEqual(resolveConnectedNodeContentsFromIndex('generator', 'reference-in', connectedContentsIndex), []);
  assert.deepEqual(
    resolveConnectedNodeContents('generator', 'prompt-in', connectedContentsElements),
    resolveConnectedNodeContentsFromIndex('generator', 'prompt-in', connectedContentsIndex),
  );

  let batchId = 0;
  const batchConnectors = buildBatchConnections(
    [textNode, imageNode, generator],
    ['prompt', 'reference', 'generator'],
    () => `batch-${++batchId}`,
  );
  assert.equal(batchConnectors.length, 2);
  assert.equal(batchConnectors.some((edge) => edge.connectorSourcePort === 'prompt-out' && edge.connectorTargetPort === 'prompt-in'), true);
  assert.equal(batchConnectors.some((edge) => edge.connectorSourcePort === 'image-out' && edge.connectorTargetPort === 'reference-in'), true);

  const imageOutput = getNodePorts(imageNode).find((port) => port.id === 'image-out');
  const referenceInput = getNodePorts(generator).find((port) => port.id === 'reference-in');
  assert.equal(canConnectPorts(imageOutput, referenceInput), true);
  const compareNode = { id: 'compare', type: 'image-compare', x: 600, y: 0 };
  assert.equal(getNodePorts(compareNode).filter((port) => port.direction === 'input').length, 2);
  assert.equal(canConnectPorts(imageOutput, getNodePorts(compareNode).find((port) => port.id === 'compare-a-in')), true);
  const secondImageNode = { id: 'reference-2', type: 'image', x: 100, y: 100, content: 'data:image/png;base64,def' };
  const compareBatch = buildBatchConnections(
    [imageNode, secondImageNode, compareNode],
    ['reference', 'reference-2', 'compare'],
    () => `compare-edge-${++batchId}`,
  );
  assert.deepEqual(compareBatch.map((edge) => edge.connectorTargetPort).sort(), ['compare-a-in', 'compare-b-in']);
  const inpaintNode = { id: 'inpaint', type: 'inpaint', x: 900, y: 0 };
  assert.equal(getNodePorts(inpaintNode).some((port) => port.id === 'image-in'), true);
  const globalViewNode = { id: 'global-view', type: 'global-view', x: 900, y: 400 };
  assert.equal(canConnectPorts(imageOutput, getNodePorts(globalViewNode).find((port) => port.id === 'image-in')), true);
  const motionNode = { id: 'motion', type: 'motion-transfer', x: 1300, y: 400 };
  const videoNode = { id: 'video', type: 'video', x: 900, y: 800, content: 'data:video/mp4;base64,abc' };
  const videoOutput = getNodePorts(videoNode).find((port) => port.id === 'video-out');
  assert.equal(canConnectPorts(imageOutput, getNodePorts(motionNode).find((port) => port.id === 'image-in')), true);
  assert.equal(canConnectPorts(videoOutput, getNodePorts(motionNode).find((port) => port.id === 'video-in')), true);
  const frameNode = { id: 'frames', type: 'video-frames', x: 1300, y: 800 };
  const breakdownNode = { id: 'breakdown', type: 'video-breakdown', x: 1700, y: 800 };
  const tableNode = { id: 'table', type: 'table-editor', x: 2100, y: 800 };
  const scriptNode = { id: 'script', type: 'script-writer', x: 2500, y: 800 };
  assert.equal(canConnectPorts(videoOutput, getNodePorts(frameNode).find((port) => port.id === 'video-in')), true);
  assert.equal(canConnectPorts(videoOutput, getNodePorts(breakdownNode).find((port) => port.id === 'video-in')), true);
  assert.equal(canConnectPorts(getNodePorts(breakdownNode).find((port) => port.id === 'content-out'), getNodePorts(tableNode).find((port) => port.id === 'content-in')), true);
  assert.equal(canConnectPorts(getNodePorts(tableNode).find((port) => port.id === 'content-out'), getNodePorts(scriptNode).find((port) => port.id === 'content-in')), true);
  assert.equal(canConnectPorts(getNodePorts(tableNode).find((port) => port.id === 'content-out'), getNodePorts(breakdownNode).find((port) => port.id === 'video-in')), false);
  assert.equal(wouldCreateConnectionCycle(normalized, 'generator', 'prompt'), true);
  assert.equal(wouldCreateConnectionCycle(normalized, 'prompt', 'reference'), false);

  console.log('Canvas connection tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
