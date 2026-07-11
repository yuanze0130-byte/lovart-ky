import type { CanvasElementType } from '@/components/lovart/CanvasArea';

export type RegisteredNodeType = CanvasElementType;

export type NodePortDirection = 'input' | 'output';
export type NodePortKind = 'prompt' | 'image' | 'video' | 'any';

export interface NodePortDefinition {
  id: string;
  label: string;
  direction: NodePortDirection;
  kind: NodePortKind;
  multiple?: boolean;
}

export type NodeCreateAction = 'image-generator' | 'video-generator' | 'image-compare' | 'inpaint';

export interface NodeDefinition {
  type: RegisteredNodeType;
  label: string;
  category: 'input' | 'generation' | 'editing' | 'output' | 'canvas' | 'internal';
  defaultSize?: { width: number; height: number };
  ports: NodePortDefinition[];
  createMenu?: {
    action: NodeCreateAction;
    label: string;
    order: number;
    icon: 'sparkles' | 'video' | 'compare' | 'paintbrush';
  };
}

const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'text', label: '文字', category: 'input', ports: [
      { id: 'prompt-out', label: '提示词', direction: 'output', kind: 'prompt' },
    ],
  },
  {
    type: 'image', label: '图片', category: 'input', ports: [
      { id: 'image-in', label: '生成结果', direction: 'input', kind: 'image' },
      { id: 'image-out', label: '图片', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'video', label: '视频', category: 'output', ports: [
      { id: 'video-in', label: '生成结果', direction: 'input', kind: 'video' },
      { id: 'video-out', label: '视频', direction: 'output', kind: 'video' },
    ],
  },
  {
    type: 'image-generator', label: '图像生成器', category: 'generation', defaultSize: { width: 400, height: 400 },
    createMenu: { action: 'image-generator', label: '图像生成器', order: 10, icon: 'sparkles' },
    ports: [
      { id: 'prompt-in', label: '提示词', direction: 'input', kind: 'prompt' },
      { id: 'reference-in', label: '参考图', direction: 'input', kind: 'image', multiple: true },
      { id: 'image-out', label: '图片结果', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'video-generator', label: '视频生成器', category: 'generation', defaultSize: { width: 400, height: 300 },
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
    type: 'image-compare', label: '图片对比', category: 'editing', defaultSize: { width: 420, height: 300 },
    createMenu: { action: 'image-compare', label: '图片对比', order: 30, icon: 'compare' },
    ports: [
      { id: 'compare-a-in', label: '图片 A', direction: 'input', kind: 'image' },
      { id: 'compare-b-in', label: '图片 B', direction: 'input', kind: 'image' },
      { id: 'image-out', label: '对比结果', direction: 'output', kind: 'image' },
    ],
  },
  {
    type: 'inpaint', label: '局部重绘', category: 'editing', defaultSize: { width: 440, height: 360 },
    createMenu: { action: 'inpaint', label: '局部重绘', order: 40, icon: 'paintbrush' },
    ports: [
      { id: 'image-in', label: '原图', direction: 'input', kind: 'image' },
      { id: 'prompt-in', label: '提示词', direction: 'input', kind: 'prompt' },
      { id: 'image-out', label: '重绘结果', direction: 'output', kind: 'image' },
    ],
  },
  { type: 'shape', label: '形状', category: 'canvas', ports: [] },
  { type: 'path', label: '路径', category: 'canvas', ports: [] },
  { type: 'connector', label: '连线', category: 'internal', ports: [] },
];

const NODE_DEFINITION_BY_TYPE = new Map(NODE_DEFINITIONS.map((definition) => [definition.type, definition]));

export function getNodeDefinition(type: string) {
  return NODE_DEFINITION_BY_TYPE.get(type as RegisteredNodeType);
}

export function getRegisteredNodePorts(type: string) {
  return getNodeDefinition(type)?.ports || [];
}

export function getCreateMenuNodeDefinitions() {
  return NODE_DEFINITIONS
    .filter((definition) => definition.createMenu)
    .sort((a, b) => (a.createMenu?.order || 0) - (b.createMenu?.order || 0));
}

export function listNodeDefinitions() {
  return [...NODE_DEFINITIONS];
}
