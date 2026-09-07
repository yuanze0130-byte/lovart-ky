import type { ImageModelId, ImageModelResolution } from '@/lib/image-models';

export type ImageApiKind = 'generation' | 'edit';

type ImageAspectRatio =
  | 'auto'
  | '1:1'
  | '4:3'
  | '3:4'
  | '16:9'
  | '9:16'
  | '3:2'
  | '2:3'
  | '21:9'
  | '9:21'
  | '4:5'
  | '5:4'
  | '2:1'
  | '1:2'
  | '4:1'
  | '1:4'
  | '8:1'
  | '1:8';

const SEEDREAM_SIZE_1K: Readonly<Record<string, string>> = {
  '1:1': '1024x1024', '4:3': '1152x864', '3:4': '864x1152',
  '16:9': '1424x800', '9:16': '800x1424', '3:2': '1248x832',
  '2:3': '832x1248', '21:9': '1568x672', '9:21': '672x1568',
};

const SEEDREAM_SIZE_2K: Readonly<Record<string, string>> = {
  '1:1': '2048x2048', '4:3': '2304x1728', '3:4': '1728x2304',
  '16:9': '2848x1600', '9:16': '1600x2848', '3:2': '2496x1664',
  '2:3': '1664x2496', '21:9': '3136x1344', '9:21': '1344x3136',
};

const SEEDREAM_5_SIZE_2K_WITH_REFERENCE: Readonly<Record<string, string>> = {
  '1:1': '1920x1920', '4:3': '2220x1665', '3:4': '1665x2220',
  '16:9': '2560x1440', '9:16': '1440x2560', '3:2': '2352x1568',
  '2:3': '1568x2352', '21:9': '2940x1260', '9:21': '1260x2940',
};

const SEEDREAM_SIZE_3K: Readonly<Record<string, string>> = {
  '1:1': '3072x3072', '4:3': '3456x2592', '3:4': '2592x3456',
  '16:9': '4096x2304', '9:16': '2304x4096', '3:2': '3744x2496',
  '2:3': '2496x3744', '21:9': '4704x2016', '9:21': '2016x4704',
};

const SEEDREAM_SIZE_4K: Readonly<Record<string, string>> = {
  '1:1': '4096x4096', '4:3': '4704x3520', '3:4': '3520x4704',
  '16:9': '5504x3040', '9:16': '3040x5504', '3:2': '4992x3328',
  '2:3': '3328x4992', '21:9': '6240x2656', '9:21': '2656x6240',
};

export function resolveImageApiKind(referenceCount: number): ImageApiKind {
  return referenceCount > 0 ? 'edit' : 'generation';
}

export function buildImageApiEndpoint(baseURL: string, kind: ImageApiKind, async = false) {
  const path = kind === 'edit' ? 'images/edits' : 'images/generations';
  return `${baseURL.replace(/\/+$/, '')}/${path}${async ? '?async=true' : ''}`;
}

export function getSeedreamImageSize(input: {
  modelId: ImageModelId;
  resolution: ImageModelResolution;
  aspectRatio: ImageAspectRatio;
  referenceCount: number;
}) {
  const ratio = input.aspectRatio === 'auto' ? '1:1' : input.aspectRatio;

  if (input.modelId === 'seedream-5.0-pro-official') {
    const sizes = input.resolution === '1K' ? SEEDREAM_SIZE_1K : SEEDREAM_SIZE_2K;
    return sizes[ratio] || (input.resolution === '1K' ? '1024x1024' : '2048x2048');
  }

  if (input.modelId === 'seedream-5.0-api') {
    if (input.resolution === '3K') return SEEDREAM_SIZE_3K[ratio] || '3072x3072';
    if (input.referenceCount > 0) return SEEDREAM_5_SIZE_2K_WITH_REFERENCE[ratio] || '1920x1920';
    return SEEDREAM_SIZE_2K[ratio] || '2048x2048';
  }

  if (input.modelId === 'seedream-4.5-api' && input.resolution === '4K') {
    return SEEDREAM_SIZE_4K[ratio] || '4096x4096';
  }

  return SEEDREAM_SIZE_2K[ratio] || '2048x2048';
}

export function buildSeedreamGenerationBody(input: {
  modelId: ImageModelId;
  model: string;
  prompt: string;
  resolution: ImageModelResolution;
  aspectRatio: ImageAspectRatio;
  references: readonly string[];
}) {
  const image = input.references.length === 0
    ? undefined
    : input.modelId === 'seedream-5.0-pro-official' || input.references.length > 1
      ? [...input.references]
      : input.references[0];

  return {
    model: input.model,
    prompt: input.prompt,
    size: getSeedreamImageSize({
      modelId: input.modelId,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      referenceCount: input.references.length,
    }),
    response_format: 'b64_json',
    watermark: false,
    ...(input.modelId === 'seedream-5.0-pro-official'
      ? {}
      : { sequential_image_generation: 'disabled' }),
    ...(image ? { image } : {}),
  };
}
