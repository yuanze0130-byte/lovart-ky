export type AnnotationPoint = { x: number; y: number };

export type AnnotationBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnnotationObject = {
  id: string;
  label?: string;
  score?: number;
  bbox: AnnotationBox;
  polygon?: AnnotationPoint[];
  maskUrl?: string;
};

export function serializeAnnotationPrompt(input: {
  prompt: string;
  object: AnnotationObject;
}) {
  const { prompt, object } = input;
  const polygonText = Array.isArray(object.polygon) && object.polygon.length > 2
    ? `Polygon points: ${object.polygon.map((point) => `(${Math.round(point.x)},${Math.round(point.y)})`).join(', ')}.`
    : 'Polygon points: unavailable.';
  const maskText = object.maskUrl ? `Mask URL: ${object.maskUrl}.` : 'Mask URL: unavailable.';

  return [
    'Edit only the selected semantic object in the reference image.',
    'Preserve the rest of the image as much as possible, including composition, lighting, camera angle, background, and unrelated objects.',
    `Selected object label: ${object.label || 'selected object'}.`,
    `Bounding box: x=${Math.round(object.bbox.x)}, y=${Math.round(object.bbox.y)}, width=${Math.round(object.bbox.width)}, height=${Math.round(object.bbox.height)}.`,
    polygonText,
    maskText,
    `User instruction: ${prompt}`,
    'If the instruction asks to remove the object, inpaint the area naturally. If replacing or modifying it, keep scale and perspective consistent.',
  ].join('\n');
}
