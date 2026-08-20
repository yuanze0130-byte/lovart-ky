export type ImageModelCategory =
  | 'Google'
  | 'OpenAI'
  | 'Black Forest Labs'
  | 'xAI'
  | 'ByteDance'
  | 'Alibaba'
  | 'Other';
export type ImageModelTransport = 'chat' | 'image-task' | 'official-image-task';

export type ImageModelId =
  | 'standard'
  | 'pro'
  | 'nano-banana'
  | 'nano-banana-2'
  | 'nano-banana-2-lite'
  | 'nano-banana-pro'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3.1-flash-image-official'
  | 'gemini-3-pro-image-official'
  | 'gemini-2.5-flash-image-official'
  | 'gpt-4o-image'
  | 'gpt-image-1'
  | 'gpt-image-1.5'
  | 'gpt-image-2'
  | 'gpt-image-2-official'
  | 'qwen-image-edit'
  | 'flux-kontext'
  | 'grok-4.1-image'
  | 'grok-4.2-image'
  | 'z-image-official'
  | 'midjourney'
  | 'seedream-4.0'
  | 'seedream-4.5'
  | 'seedream-5.0-pro-official'
  | 'seedream-4.5-api'
  | 'seedream-5.0-api';

export interface ImageModelDefinition {
  id: Exclude<ImageModelId, 'standard' | 'pro'>;
  label: string;
  category: ImageModelCategory;
  description: string;
  transport: ImageModelTransport;
  proxyModel: string;
  supportsReferences: boolean;
  supportsEditing: boolean;
  requiresReference?: boolean;
}

export const IMAGE_MODEL_OPTIONS: ImageModelDefinition[] = [
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    category: 'Google',
    description: '通用生图与参考图编辑',
    transport: 'chat',
    proxyModel: 'nano-banana-2',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'nano-banana-2-lite',
    label: 'Nano Banana 2 Lite',
    category: 'Google',
    description: '轻量快速生成，经中转站映射到 Gemini 3.1 Flash Lite Image',
    transport: 'chat',
    proxyModel: 'gemini-3.1-flash-lite-image',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    category: 'Google',
    description: '高质量商业图与复杂构图',
    transport: 'chat',
    proxyModel: 'nano-banana-pro',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    category: 'Google',
    description: '高速生成与多轮视觉理解',
    transport: 'chat',
    proxyModel: 'gemini-3.1-flash-image-preview',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gemini-3.1-flash-image-official',
    label: 'Gemini 3.1 Flash 官',
    category: 'Google',
    description: '中转站 Gemini 3.1 Flash Image 正式模型入口',
    transport: 'chat',
    proxyModel: 'gemini-3.1-flash-image',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gemini-3-pro-image-official',
    label: 'Gemini 3 Pro 官',
    category: 'Google',
    description: '复杂构图、文字渲染与高质量参考图编辑',
    transport: 'chat',
    proxyModel: 'gemini-3-pro-image',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gemini-2.5-flash-image-official',
    label: 'Gemini 2.5 Flash 官',
    category: 'Google',
    description: '快速生成与参考图编辑的稳定版本',
    transport: 'chat',
    proxyModel: 'gemini-2.5-flash-image',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    category: 'OpenAI',
    description: '高质量生成与精细编辑',
    transport: 'image-task',
    proxyModel: 'gpt-image-2-all',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gpt-image-2-official',
    label: 'GPT Image 2 Official',
    category: 'OpenAI',
    description: '官方参数与透明背景输出',
    transport: 'official-image-task',
    proxyModel: 'gpt-image-2',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'seedream-4.5',
    label: 'Seedream 4.5',
    category: 'ByteDance',
    description: '高细节中文场景与商业视觉',
    transport: 'chat',
    proxyModel: 'seedream-4.5',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'seedream-5.0-pro-official',
    label: 'Seedream 5.0 Pro官',
    category: 'ByteDance',
    description: '高质量中文商业视觉与多参考图生成',
    transport: 'chat',
    proxyModel: 'seedream-v5-pro',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'seedream-4.5-api',
    label: 'Seedream 4.5 API',
    category: 'ByteDance',
    description: '中转站火山方舟 Seedream 4.5 模型入口',
    transport: 'chat',
    proxyModel: 'doubao-seedream-4-5-251128',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'seedream-5.0-api',
    label: 'Seedream 5.0 API',
    category: 'ByteDance',
    description: '中转站火山方舟 Seedream 5.0 模型入口',
    transport: 'chat',
    proxyModel: 'doubao-seedream-5-0-260128',
    supportsReferences: true,
    supportsEditing: true,
  },
];

const MODEL_IDS = new Set<ImageModelId>([
  'standard',
  'pro',
  ...IMAGE_MODEL_OPTIONS.map((model) => model.id),
]);

export function isImageModelId(value: unknown): value is ImageModelId {
  return typeof value === 'string' && MODEL_IDS.has(value as ImageModelId);
}

export function normalizeImageModelId(modelId: ImageModelId): ImageModelDefinition['id'] {
  if (modelId === 'standard') return 'nano-banana-2';
  if (modelId === 'pro') return 'nano-banana-pro';
  return modelId;
}

export function getImageModelDefinition(modelId: ImageModelId) {
  const normalized = normalizeImageModelId(modelId);
  return IMAGE_MODEL_OPTIONS.find((model) => model.id === normalized)
    || IMAGE_MODEL_OPTIONS.find((model) => model.id === 'nano-banana-pro')
    || IMAGE_MODEL_OPTIONS[0];
}

export const IMAGE_MODEL_CATEGORIES: ImageModelCategory[] = [
  'Google',
  'OpenAI',
  'ByteDance',
];

export type ImageGenerationExecutionMode = 'sequential' | 'parallel';
