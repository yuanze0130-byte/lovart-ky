import {
  getImageModelDefinition,
  type ImageModelId,
  type ImageModelResolution,
} from '@/lib/image-models';

export type ImageResolution = ImageModelResolution;

export interface ImageModelRoutingInput {
  modelId: ImageModelId;
  resolution: ImageResolution;
}

export class ImageModelResolutionError extends Error {
  readonly code = 'IMAGE_MODEL_RESOLUTION_UNSUPPORTED';

  constructor(message: string) {
    super(message);
    this.name = 'ImageModelResolutionError';
  }
}

export function isImageModelResolutionError(error: unknown): error is ImageModelResolutionError {
  return error instanceof ImageModelResolutionError;
}

export function resolveImageUpstreamModel(input: ImageModelRoutingInput) {
  const definition = getImageModelDefinition(input.modelId);
  const upstreamModel = definition.upstreamModels[input.resolution];

  if (!upstreamModel) {
    throw new ImageModelResolutionError(
      `${definition.label} 不支持 ${input.resolution}，可用分辨率：${definition.supportedResolutions.join('、')}`,
    );
  }

  // Active model ids are deliberately not overridden by legacy environment
  // variables. UI selection, upstream transport and billing must use this same
  // catalog entry or they can silently drift apart after a deployment.
  return upstreamModel;
}
