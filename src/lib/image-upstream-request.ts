export type ImageApiKind = 'generation' | 'edit';

export function resolveImageApiKind(referenceCount: number): ImageApiKind {
  return referenceCount > 0 ? 'edit' : 'generation';
}

export function buildImageApiEndpoint(baseURL: string, kind: ImageApiKind, async = false) {
  const path = kind === 'edit' ? 'images/edits' : 'images/generations';
  return `${baseURL.replace(/\/+$/, '')}/${path}${async ? '?async=true' : ''}`;
}
