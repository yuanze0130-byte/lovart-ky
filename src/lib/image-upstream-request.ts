export type ImageApiKind = 'generation' | 'edit';
export const NANO_BANANA_GENERATION_ASPECT_RATIOS = ['4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1', '4:5', '5:4', '21:9'] as const;

export function buildNanoBananaGenerationBody(input: {
  model: string;
  prompt: string;
  aspectRatio?: string;
  images?: string[];
}) {
  const aspectRatio = NANO_BANANA_GENERATION_ASPECT_RATIOS.includes(input.aspectRatio as typeof NANO_BANANA_GENERATION_ASPECT_RATIOS[number])
    ? input.aspectRatio : '1:1';
  return {
    model: input.model,
    prompt: input.prompt,
    aspect_ratio: aspectRatio,
    response_format: 'b64_json' as const,
    ...(input.images?.length ? { image: input.images } : {}),
  };
}

export function resolveImageApiKind(referenceCount: number): ImageApiKind {
  return referenceCount > 0 ? 'edit' : 'generation';
}

export function buildImageApiEndpoint(baseURL: string, kind: ImageApiKind, async = false) {
  const path = kind === 'edit' ? 'images/edits' : 'images/generations';
  return `${baseURL.replace(/\/+$/, '')}/${path}${async ? '?async=true' : ''}`;
}
