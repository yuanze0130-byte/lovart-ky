export type ImageModelCategory = 'Google' | 'OpenAI' | 'ByteDance' | 'Alibaba';
export type ImageModelTransport = 'chat' | 'image-task' | 'official-image-task';

export type ImageModelId =
  | 'standard'
  | 'pro'
  | 'nano-banana'
  | 'nano-banana-2'
  | 'nano-banana-pro'
  | 'gemini-3.1-flash-image-preview'
  | 'gpt-image-1'
  | 'gpt-image-1.5'
  | 'gpt-image-2'
  | 'gpt-image-2-official'
  | 'qwen-image-edit'
  | 'seedream-4.0'
  | 'seedream-4.5';

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
    id: 'nano-banana',
    label: 'Nano Banana',
    category: 'Google',
    description: '快速草图与低成本迭代',
    transport: 'chat',
    proxyModel: 'nano-banana',
    supportsReferences: true,
    supportsEditing: true,
  },
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
    id: 'gpt-image-1',
    label: 'GPT Image 1',
    category: 'OpenAI',
    description: '稳定的通用图像生成',
    transport: 'image-task',
    proxyModel: 'gpt-image-1',
    supportsReferences: true,
    supportsEditing: true,
  },
  {
    id: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    category: 'OpenAI',
    description: '更强文字与指令遵循',
    transport: 'image-task',
    proxyModel: 'gpt-image-1.5',
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
    id: 'seedream-4.0',
    label: 'Seedream 4.0',
    category: 'ByteDance',
    description: '中文语义与设计图生成',
    transport: 'chat',
    proxyModel: 'seedream-4.0',
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
    id: 'qwen-image-edit',
    label: 'Qwen Image Edit',
    category: 'Alibaba',
    description: '参考图修改与局部重绘',
    transport: 'chat',
    proxyModel: 'qwen-image-edit',
    supportsReferences: true,
    supportsEditing: true,
    requiresReference: true,
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
  return IMAGE_MODEL_OPTIONS.find((model) => model.id === normalized) || IMAGE_MODEL_OPTIONS[2];
}

export const IMAGE_MODEL_CATEGORIES: ImageModelCategory[] = ['Google', 'OpenAI', 'ByteDance', 'Alibaba'];

export type ImageGenerationExecutionMode = 'sequential' | 'parallel';
