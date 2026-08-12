import { getImageModelDefinition, type ImageModelId } from '@/lib/image-models';

export type ImageResolution = '1K' | '2K' | '4K';

export interface ImageModelRoutingInput {
  modelId: ImageModelId;
  resolution: ImageResolution;
}

function resolutionVariant(baseModel: string, resolution: ImageResolution) {
  if (resolution === '2K') return `${baseModel}-2k`;
  if (resolution === '4K') return `${baseModel}-4k`;
  return baseModel;
}

export function resolveImageUpstreamModel(input: ImageModelRoutingInput) {
  const { modelId, resolution } = input;
  const definition = getImageModelDefinition(modelId);

  if (modelId === 'gpt-image-2-official') {
    return process.env.GEMINI_PROXY_GPT_IMAGE_2_OFFICIAL_MODEL || 'gpt-image-2';
  }

  if (modelId === 'gpt-image-2') {
    return process.env.GEMINI_PROXY_GPT_IMAGE_2_MODEL || 'gpt-image-2-all';
  }

  if (modelId === 'gpt-image-1.5') {
    return process.env.GEMINI_PROXY_GPT_IMAGE_1_5_MODEL || definition.proxyModel;
  }

  if (modelId === 'gpt-image-1') {
    return process.env.GEMINI_PROXY_GPT_IMAGE_1_MODEL || definition.proxyModel;
  }

  if (modelId === 'standard' || modelId === 'nano-banana-2') {
    if (resolution === '2K') {
      return process.env.GEMINI_PROXY_STANDARD_MODEL_2K
        || process.env.GEMINI_PROXY_STANDARD_MODEL_HD
        || 'nano-banana-hd';
    }
    if (resolution === '4K') {
      return process.env.GEMINI_PROXY_STANDARD_MODEL_4K || 'gemini-3.1-flash-image-preview-4k';
    }
    return process.env.GEMINI_PROXY_STANDARD_MODEL || 'nano-banana';
  }

  if (modelId === 'nano-banana') {
    return process.env.GEMINI_PROXY_NANO_BANANA_MODEL || definition.proxyModel;
  }

  if (modelId === 'pro' || modelId === 'nano-banana-pro') {
    if (resolution === '2K') {
      return process.env.GEMINI_PROXY_PRO_MODEL_2K || 'nano-banana-pro-2k';
    }
    if (resolution === '4K') {
      return process.env.GEMINI_PROXY_PRO_MODEL_4K || 'nano-banana-pro-4k';
    }
    return process.env.GEMINI_PROXY_PRO_MODEL || process.env.GEMINI_PROXY_MODEL || 'nano-banana-pro';
  }

  if (modelId === 'gemini-3.1-flash-image-preview') {
    return resolutionVariant('gemini-3.1-flash-image-preview', resolution);
  }

  if (modelId === 'gemini-3.1-flash-image-official') {
    return resolutionVariant('gemini-3.1-flash-image', resolution);
  }

  if (modelId === 'gemini-3-pro-image-official') {
    return resolutionVariant('gemini-3-pro-image', resolution);
  }

  // The old aliases no longer appear on Comfly's current price page. Route them
  // to the currently listed API model names so generation and billing agree.
  if (modelId === 'seedream-4.0') return 'doubao-seedream-4-0-250828';
  if (modelId === 'seedream-4.5') return 'doubao-seedream-4-5-251128';

  return definition.proxyModel;
}
