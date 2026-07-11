import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'src', 'lib', 'qdmy-project.ts');
const outputPath = path.join(root, 'tmp', 'qdmy-project.test.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, compiled.outputText);

try {
  const { exportQdmyProject, importQdmyProject, mergeQdmyElements } = await import(`${pathToFileURL(outputPath).href}?t=${Date.now()}`);
  const desktopProject = {
    appName: 'tuai',
    version: '3.4.4',
    title: '格式恢复验证',
    view: { zoom: 1.25, centerX: 640, centerY: 360 },
    nodes: [
      { id: 'text-1', type: 'text-node', x: 10, y: 20, width: 280, content: '产品摄影提示词' },
      { id: 'image-1', type: 'input-image', position: { x: 340, y: 20 }, url: 'data:image/png;base64,AA==' },
      {
        id: 'generate-1', type: 'gen-image', x: 700, y: 20, nodeName: '主视觉',
        settings: { prompt: '白色背景上的透明玻璃香水瓶', model: 'gpt-image-2', imageModelId: 'gpt-image-2', imageOutputCount: 4, imageExecutionMode: 'parallel', ratio: '4:5', resolution: '2K', platformGroup: 'openai' },
      },
      {
        id: 'video-1', type: 'gen-video', x: 1120, y: 20,
        settings: { prompt: '镜头缓慢推进', model: 'seedance-1.5-pro', ratio: '16:9', resolution: '1K' },
      },
      { id: 'agent-1', type: 'custom-agent', x: 10, y: 420, nodeName: '商品摄影 Agent', prompt: '分析参考图并生成三版方案' },
      { id: 'comfy-1', type: 'comfy-ui', x: 420, y: 420, nodeName: 'Comfy 工作流', settings: { prompt: '工作流提示词' } },
    ],
    connections: [
      { id: 'connection-1', fromNodeId: 'image-1', toNodeId: 'generate-1', style: 'dashed' },
      { id: 'connection-2', from: 'generate-1', to: 'video-1' },
    ],
    groups: [{ id: 'group-1', nodeIds: ['text-1', 'image-1'] }],
  };

  const imported = importQdmyProject(desktopProject);
  assert.equal(imported.title, desktopProject.title);
  assert.equal(imported.stats.nodes, 6);
  assert.equal(imported.stats.connections, 2);
  assert.equal(imported.stats.skipped, 0);
  assert.equal(imported.elements.length, 8);
  assert.deepEqual(imported.view, desktopProject.view);

  const generator = imported.elements.find((element) => element.id === 'generate-1');
  assert.equal(generator?.type, 'image-generator');
  assert.equal(generator?.prompt, '白色背景上的透明玻璃香水瓶');
  assert.equal(generator?.requestedAspectRatio, '4:5');
  assert.equal(generator?.requestedResolution, '2K');
  assert.equal(generator?.generationMetadata?.model, 'gpt-image-2');
  assert.equal(generator?.generationMetadata?.desktopPlatformGroup, 'openai');
  assert.equal(generator?.imageModelId, 'gpt-image-2');
  assert.equal(generator?.imageOutputCount, 4);
  assert.equal(generator?.imageExecutionMode, 'parallel');
  assert.equal(imported.elements.find((element) => element.id === 'agent-1')?.type, 'text');
  assert.equal(imported.elements.find((element) => element.id === 'comfy-1')?.type, 'image-generator');

  const exported = exportQdmyProject({
    title: imported.title,
    elements: imported.elements,
    view: imported.view,
  });
  assert.equal(exported.nodes.length, 6);
  assert.equal(exported.connections.length, 2);
  assert.equal(exported.groups.length, 1);
  assert.deepEqual(exported.groups[0].nodeIds.sort(), ['image-1', 'text-1']);

  const exportedGenerator = exported.nodes.find((node) => node.id === 'generate-1');
  assert.equal(exportedGenerator.settings.prompt, '白色背景上的透明玻璃香水瓶');
  assert.equal(exportedGenerator.settings.model, 'gpt-image-2');
  assert.equal(exportedGenerator.settings.ratio, '4:5');
  assert.equal(exportedGenerator.settings.resolution, '2K');
  assert.equal(exportedGenerator.settings.platformGroup, 'openai');
  assert.equal(exportedGenerator.settings.imageModelId, 'gpt-image-2');
  assert.equal(exportedGenerator.settings.imageOutputCount, 4);
  assert.equal(exportedGenerator.settings.imageExecutionMode, 'parallel');
  assert.deepEqual(exported.visibleModels, ['gpt-image-2']);
  assert.equal(exported.nodes.find((node) => node.id === 'agent-1').type, 'custom-agent');
  assert.equal(exported.nodes.find((node) => node.id === 'comfy-1').type, 'comfy-ui');

  const merged = mergeQdmyElements([
    { id: 'generate-1', type: 'text', x: 0, y: 0, content: 'existing' },
  ], imported.elements);
  const mergedGenerator = merged.elements.find((element) => element.id === 'generate-1-imported-2');
  const mergedConnection = merged.elements.find((element) => element.connectorTo === 'generate-1-imported-2');
  assert.equal(mergedGenerator?.x, generator.x + 80);
  assert.ok(mergedConnection, 'connection endpoint should follow a remapped duplicate node id');
  assert.equal(new Set(merged.elements.map((element) => element.id)).size, merged.elements.length);

  console.log('QDMY project compatibility: 6 nodes, 2 connections, and 1 group passed round-trip verification.');
} finally {
  fs.rmSync(outputPath, { force: true });
}
