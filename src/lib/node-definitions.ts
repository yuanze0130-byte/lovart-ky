import type { CanvasElement, CanvasElementType } from '@/components/lovart/CanvasArea';

export type RegisteredNodeType = CanvasElementType;

export type NodePortDirection = 'input' | 'output';
export type NodePortKind = 'prompt' | 'content' | 'image' | 'video' | 'any';

export interface NodePortDefinition {
  id: string;
  label: string;
  direction: NodePortDirection;
  kind: NodePortKind;
  multiple?: boolean;
}

export type NodeCreateAction = 'image-generator' | 'video-generator' | 'image-compare' | 'global-view' | 'motion-transfer' | 'table-editor' | 'video-frames' | 'video-breakdown' | 'inpaint';

export interface NodeDefinition {
  type: RegisteredNodeType;
  label: string;
  category: 'input' | 'generation' | 'editing' | 'output' | 'canvas' | 'internal';
  defaultState?: Partial<CanvasElement>;
  ports: NodePortDefinition[];
  creatable?: boolean;
  runnable?: boolean;
  qdmy: {
    importTypes: string[];
    exportType: string;
  };
  createMenu?: {
    action: NodeCreateAction;
    label: string;
    order: number;
    icon: 'sparkles' | 'video' | 'compare' | 'globe' | 'motion' | 'table' | 'frames' | 'breakdown' | 'paintbrush';
  };
}

const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'text', label: '文字', category: 'input',
    qdmy: { importTypes: ['text-node', 'custom-agent', 'storyboard-menu', 'gen-music', 'gen-speech'], exportType: 'text-node' },
    ports: [
      { id: 'prompt-out', label: '提示词', direction: 'output', kind: 'prompt' },
    ],
  },
  {
    type: 'image', label: '图片', category: 'input',
    qdmy: { importTypes: ['input-image', 'preview'], exportType: 'input-image' },
    ports: [
      { id: 'image-in', label: '生成结果', direction: 'input', kind: 'image' },
      { id: 'image-out', label: '图片', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'video', label: '视频', category: 'output',
    qdmy: { importTypes: [], exportType: 'preview' },
    ports: [
      { id: 'video-in', label: '生成结果', direction: 'input', kind: 'video' },
      { id: 'video-out', label: '视频', direction: 'output', kind: 'video' },
    ],
  },
  {
    type: 'image-generator', label: '图像生成器', category: 'generation',
    defaultState: { width: 400, height: 400, generatorKind: 'image' },
    creatable: true,
    runnable: true,
    qdmy: { importTypes: ['gen-image', 'comfy-ui'], exportType: 'gen-image' },
    createMenu: { action: 'image-generator', label: '图像生成器', order: 10, icon: 'sparkles' },
    ports: [
      { id: 'prompt-in', label: '提示词', direction: 'input', kind: 'prompt' },
      { id: 'reference-in', label: '参考图', direction: 'input', kind: 'image', multiple: true },
      { id: 'image-out', label: '图片结果', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'video-generator', label: '视频生成器', category: 'generation',
    defaultState: { width: 430, height: 460, videoModelId: 'jimeng-cli-seedance2.0', videoAspectRatio: '16:9', videoDuration: 8, videoResolution: '1080p' },
    creatable: true,
    runnable: true,
    qdmy: { importTypes: ['gen-video'], exportType: 'gen-video' },
    createMenu: { action: 'video-generator', label: '视频生成器', order: 20, icon: 'video' },
    ports: [
      { id: 'prompt-in', label: '提示词', direction: 'input', kind: 'prompt' },
      { id: 'reference-in', label: '参考素材', direction: 'input', kind: 'image', multiple: true },
      { id: 'first-frame-in', label: '首帧', direction: 'input', kind: 'image' },
      { id: 'last-frame-in', label: '尾帧', direction: 'input', kind: 'image' },
      { id: 'video-out', label: '视频结果', direction: 'output', kind: 'video' },
    ],
  },
  {
    type: 'image-compare', label: '图片对比', category: 'editing',
    defaultState: { width: 420, height: 300, imageCompareSplit: 50, imageCompareSwapped: false },
    creatable: true,
    qdmy: { importTypes: ['image-compare'], exportType: 'image-compare' },
    createMenu: { action: 'image-compare', label: '图片对比', order: 30, icon: 'compare' },
    ports: [
      { id: 'compare-a-in', label: '图片 A', direction: 'input', kind: 'image' },
      { id: 'compare-b-in', label: '图片 B', direction: 'input', kind: 'image' },
      { id: 'image-out', label: '对比结果', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'global-view', label: '全局视角', category: 'editing',
    defaultState: {
      width: 420,
      height: 390,
      globalViewZoom: 1,
      globalViewOffsetX: 0,
      globalViewOffsetY: 0,
      globalViewRotation: 0,
    },
    creatable: true,
    qdmy: { importTypes: ['global-perspective'], exportType: 'global-perspective' },
    createMenu: { action: 'global-view', label: '全局视角', order: 32, icon: 'globe' },
    ports: [
      { id: 'image-in', label: '参考图', direction: 'input', kind: 'image' },
      { id: 'image-out', label: '视角图', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'motion-transfer', label: '动作迁移', category: 'generation',
    defaultState: {
      width: 420,
      height: 580,
      motionModel: 'kling-2.6',
      motionMode: 'std',
      motionKeepAudio: true,
      motionOrientation: 'image',
      motionWatermark: false,
    },
    creatable: true,
    runnable: true,
    qdmy: { importTypes: ['motion-control'], exportType: 'motion-control' },
    createMenu: { action: 'motion-transfer', label: '动作迁移', order: 34, icon: 'motion' },
    ports: [
      { id: 'image-in', label: '参考图', direction: 'input', kind: 'image' },
      { id: 'video-in', label: '参考视频', direction: 'input', kind: 'video' },
      { id: 'prompt-in', label: '动作提示词', direction: 'input', kind: 'prompt' },
      { id: 'video-out', label: '迁移结果', direction: 'output', kind: 'video' },
    ],
  },
  {
    type: 'table-editor', label: '表格编辑', category: 'editing',
    defaultState: {
      width: 520,
      height: 430,
      tableColumns: ['#'],
      tableRows: [],
      tableView: 'table',
      tableAutoHeight: true,
      tableMarkdown: '',
    },
    creatable: true,
    qdmy: { importTypes: ['table-editor-node'], exportType: 'table-editor-node' },
    createMenu: { action: 'table-editor', label: '表格编辑', order: 36, icon: 'table' },
    ports: [
      { id: 'prompt-in', label: '文本 / Agent', direction: 'input', kind: 'prompt' },
      { id: 'content-in', label: '结构化内容', direction: 'input', kind: 'content' },
      { id: 'content-out', label: '表格内容', direction: 'output', kind: 'content' },
    ],
  },
  {
    type: 'video-frames', label: '视频抽帧', category: 'editing',
    defaultState: { width: 440, height: 500, videoFrameCount: 6 },
    creatable: true,
    qdmy: { importTypes: ['video-frame-extract'], exportType: 'video-frame-extract' },
    createMenu: { action: 'video-frames', label: '视频抽帧', order: 38, icon: 'frames' },
    ports: [
      { id: 'video-in', label: '视频输入', direction: 'input', kind: 'video' },
      { id: 'image-out', label: '关键帧', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'video-breakdown', label: '视频拆解', category: 'editing',
    defaultState: { width: 440, height: 540, videoBreakdownRows: [] },
    creatable: true,
    runnable: true,
    qdmy: { importTypes: ['video-analyze'], exportType: 'video-analyze' },
    createMenu: { action: 'video-breakdown', label: '视频拆解', order: 39, icon: 'breakdown' },
    ports: [
      { id: 'video-in', label: '视频输入', direction: 'input', kind: 'video' },
      { id: 'prompt-in', label: '拆解要求', direction: 'input', kind: 'prompt' },
      { id: 'content-out', label: '拆解结果', direction: 'output', kind: 'content' },
    ],
  },
  {
    type: 'script-writer', label: '剧本创作', category: 'generation',
    defaultState: {
      width: 460,
      height: 600,
      scriptGenre: '剧情短片',
      scriptDurationMinutes: 3,
      scriptCharacters: '',
      scriptScenes: [],
    },
    creatable: true,
    runnable: true,
    qdmy: { importTypes: ['storyboard-node', 'storyboard-chart-node', 'script-writer'], exportType: 'storyboard-node' },
    ports: [
      { id: 'prompt-in', label: '创意 / 文本', direction: 'input', kind: 'prompt' },
      { id: 'content-in', label: '拆解 / 表格', direction: 'input', kind: 'content' },
      { id: 'script-out', label: '剧本', direction: 'output', kind: 'content' },
    ],
  },
  {
    type: 'inpaint', label: '局部重绘', category: 'editing',
    defaultState: { width: 440, height: 360, inpaintBrushSize: 32, inpaintFeather: 4 },
    creatable: true,
    runnable: true,
    qdmy: { importTypes: ['inpaint-menu'], exportType: 'inpaint-menu' },
    createMenu: { action: 'inpaint', label: '局部重绘', order: 50, icon: 'paintbrush' },
    ports: [
      { id: 'image-in', label: '原图', direction: 'input', kind: 'image' },
      { id: 'prompt-in', label: '提示词', direction: 'input', kind: 'prompt' },
      { id: 'image-out', label: '重绘结果', direction: 'output', kind: 'image' },
    ],
  },
  { type: 'shape', label: '形状', category: 'canvas', ports: [], qdmy: { importTypes: ['group'], exportType: 'group' } },
  { type: 'path', label: '路径', category: 'canvas', ports: [], qdmy: { importTypes: [], exportType: 'preview' } },
  { type: 'connector', label: '连线', category: 'internal', ports: [], qdmy: { importTypes: ['connector'], exportType: 'connector' } },
];

const NODE_DEFINITION_BY_TYPE = new Map(NODE_DEFINITIONS.map((definition) => [definition.type, definition]));
const NODE_TYPE_BY_QDMY_IMPORT_TYPE = new Map(
  NODE_DEFINITIONS.flatMap((definition) => definition.qdmy.importTypes.map((type) => [type, definition.type] as const)),
);

export function getNodeDefinition(type: string) {
  return NODE_DEFINITION_BY_TYPE.get(type as RegisteredNodeType);
}

export function getRegisteredNodePorts(type: string) {
  return getNodeDefinition(type)?.ports || [];
}

export function getNodeDefaultState(type: string): Partial<CanvasElement> {
  return { ...(getNodeDefinition(type)?.defaultState || {}) };
}

export function getNodeTypeForQdmyImport(type: string): RegisteredNodeType | null {
  return NODE_TYPE_BY_QDMY_IMPORT_TYPE.get(type) || null;
}

export function getQdmyExportType(type: string) {
  return getNodeDefinition(type)?.qdmy.exportType;
}

export function getCreateMenuNodeDefinitions() {
  return NODE_DEFINITIONS
    .filter((definition) => definition.createMenu)
    .sort((a, b) => (a.createMenu?.order || 0) - (b.createMenu?.order || 0));
}

export function listNodeDefinitions() {
  return [...NODE_DEFINITIONS];
}
