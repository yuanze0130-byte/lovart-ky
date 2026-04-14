import OpenAI from 'openai';
import type { AnnotationBox, AnnotationObject, AnnotationPoint } from '@/lib/object-annotation';

export type DetectObjectParams = {
  image: string;
  imageWidth: number;
  imageHeight: number;
  click: AnnotationPoint;
  fallback: AnnotationObject;
};

export type DetectObjectResult = {
  object: AnnotationObject;
  provider: string;
  model?: string;
  details?: string;
};

type VisionDetectedObject = {
  label?: string;
  score?: number;
  bbox?: Partial<AnnotationBox>;
  polygon?: AnnotationPoint[];
  maskUrl?: string;
};

type SamProviderResponse = {
  label?: string;
  score?: number;
  bbox?: Partial<AnnotationBox>;
  polygon?: AnnotationPoint[];
  maskUrl?: string;
  details?: string;
};

function normalizeReferenceImage(referenceImage?: string) {
  if (!referenceImage) return undefined;

  const trimmed = referenceImage.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\/[\w.+-]+;base64,/i.test(trimmed)) return trimmed;

  return `data:image/jpeg;base64,${trimmed.replace(/^data:image\/[\w.+-]+;base64,/i, '')}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function normalizeBBox(value: Partial<AnnotationBox> | undefined, imageWidth: number, imageHeight: number, fallback: AnnotationBox) {
  if (!value) return fallback;

  const rawX = Number(value.x);
  const rawY = Number(value.y);
  const rawWidth = Number(value.width);
  const rawHeight = Number(value.height);

  if (![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite)) return fallback;

  const looksNormalized = rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1 && rawWidth > 0 && rawWidth <= 1 && rawHeight > 0 && rawHeight <= 1;
  const x = looksNormalized ? rawX * imageWidth : rawX;
  const y = looksNormalized ? rawY * imageHeight : rawY;
  const width = looksNormalized ? rawWidth * imageWidth : rawWidth;
  const height = looksNormalized ? rawHeight * imageHeight : rawHeight;

  const nextWidth = clamp(width, 24, imageWidth);
  const nextHeight = clamp(height, 24, imageHeight);

  return {
    x: clamp(x, 0, Math.max(0, imageWidth - nextWidth)),
    y: clamp(y, 0, Math.max(0, imageHeight - nextHeight)),
    width: nextWidth,
    height: nextHeight,
  };
}

function buildAnnotationObject(input: {
  parsed?: Partial<SamProviderResponse> | Partial<VisionDetectedObject>;
  fallback: AnnotationObject;
  imageWidth: number;
  imageHeight: number;
}) {
  const parsed = input.parsed || {};
  const bbox = normalizeBBox(parsed.bbox, input.imageWidth, input.imageHeight, input.fallback.bbox);

  return {
    id: `detected-${Date.now()}`,
    label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim() : input.fallback.label,
    score: typeof parsed.score === 'number' ? clamp(parsed.score, 0, 1) : input.fallback.score || 0.72,
    bbox,
    polygon: Array.isArray(parsed.polygon) ? parsed.polygon : undefined,
    maskUrl: typeof parsed.maskUrl === 'string' ? parsed.maskUrl : undefined,
  };
}

async function detectWithVisionModel(params: DetectObjectParams): Promise<DetectObjectResult> {
  const apiKey = process.env.OBJECT_DETECTION_API_KEY || process.env.GEMINI_API_KEY;
  const baseURL = process.env.OBJECT_DETECTION_BASE_URL || process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';
  const model = process.env.OBJECT_DETECTION_MODEL || process.env.GEMINI_PROXY_TEXT_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error('OBJECT_DETECTION_API_KEY or GEMINI_API_KEY not configured');
  }

  const normalizedImage = normalizeReferenceImage(params.image);
  if (!normalizedImage) {
    throw new Error('Invalid image');
  }

  const client = new OpenAI({ apiKey, baseURL });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a visual object localization assistant. Return JSON only. Given an image and a click point in displayed image pixel coordinates, identify the most likely semantic object under or nearest to that point. Return {"label": string, "score": number, "bbox": {"x": number, "y": number, "width": number, "height": number}, "polygon": [{"x": number, "y": number}], "maskUrl": string, "reason": string}. bbox can be approximate, polygon/maskUrl are optional.',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: normalizedImage } },
          {
            type: 'text',
            text: `Displayed image size: ${params.imageWidth}x${params.imageHeight}. Click point: (${Math.round(params.click.x)}, ${Math.round(params.click.y)}). Identify the object at this point and return the best bounding box in displayed pixel coordinates. If possible, also provide polygon points around the object.`,
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('empty model response');
  }

  const parsed = JSON.parse(content) as VisionDetectedObject;

  return {
    object: buildAnnotationObject({
      parsed,
      fallback: params.fallback,
      imageWidth: params.imageWidth,
      imageHeight: params.imageHeight,
    }),
    provider: 'vision-model',
    model,
  };
}

async function detectWithStub(params: DetectObjectParams): Promise<DetectObjectResult> {
  return {
    object: params.fallback,
    provider: 'stub',
    details: 'Stub provider returned fallback bounding box.',
  };
}

async function detectWithSamHttp(params: DetectObjectParams): Promise<DetectObjectResult> {
  const endpoint = process.env.OBJECT_SEGMENTATION_ENDPOINT;
  if (!endpoint) {
    throw new Error('OBJECT_SEGMENTATION_ENDPOINT not configured');
  }

  const timeoutMs = Number(process.env.OBJECT_SEGMENTATION_TIMEOUT_MS || '20000');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OBJECT_SEGMENTATION_API_KEY
          ? { Authorization: `Bearer ${process.env.OBJECT_SEGMENTATION_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        image: params.image,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
        click: params.click,
        mode: 'point-segmentation',
      }),
      signal: controller.signal,
    });

    const data = await response.json() as SamProviderResponse;
    if (!response.ok) {
      throw new Error(data.details || `Segmentation provider error (${response.status})`);
    }

    return {
      object: buildAnnotationObject({
        parsed: data,
        fallback: params.fallback,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
      }),
      provider: 'sam-http',
      details: data.details,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function detectWithSamPlaceholder(params: DetectObjectParams): Promise<DetectObjectResult> {
  return {
    object: {
      ...params.fallback,
      polygon: [
        { x: params.fallback.bbox.x, y: params.fallback.bbox.y },
        { x: params.fallback.bbox.x + params.fallback.bbox.width, y: params.fallback.bbox.y },
        { x: params.fallback.bbox.x + params.fallback.bbox.width, y: params.fallback.bbox.y + params.fallback.bbox.height },
        { x: params.fallback.bbox.x, y: params.fallback.bbox.y + params.fallback.bbox.height },
      ],
    },
    provider: 'sam-placeholder',
    details: 'Placeholder SAM provider returned bbox polygon. Replace with real segmentation service later.',
  };
}

export async function detectObjectWithProvider(params: DetectObjectParams): Promise<DetectObjectResult> {
  const provider = (process.env.OBJECT_DETECTION_PROVIDER || 'vision').toLowerCase();

  if (provider === 'stub') {
    return detectWithStub(params);
  }

  if (provider === 'sam' || provider === 'segmentation') {
    if (process.env.OBJECT_SEGMENTATION_ENDPOINT) {
      return detectWithSamHttp(params);
    }
    return detectWithSamPlaceholder(params);
  }

  return detectWithVisionModel(params);
}
