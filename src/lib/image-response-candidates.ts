export type ImageResponseCandidate =
  | { kind: 'data-url'; value: string }
  | { kind: 'base64'; value: string; mimeType: string }
  | { kind: 'url'; value: string };

const MAX_TRAVERSAL_DEPTH = 8;
const MAX_VISITED_VALUES = 256;
const IMAGE_VALUE_KEYS = /(?:^|_)(?:image|images|image_url|output|output_url|result|results|url|uri|src|b64_json|image_base64|base64|data)(?:$|_)/i;
const BASE64_VALUE_KEYS = /(?:b64_json|image_base64|base64)$/i;
const URL_VALUE_KEYS = /(?:image_url|output_url|url|uri|src)$/i;
const DATA_IMAGE_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/ig;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/ig;
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/ig;

function trimUrl(value: string) {
  return value.replace(/[),.;\]}]+$/g, '');
}

function looksLikeBase64(value: string) {
  const normalized = value.trim();
  return normalized.length > 100
    && normalized.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

export function collectImageResponseCandidates(input: unknown): ImageResponseCandidate[] {
  const candidates: Array<ImageResponseCandidate & { priority: number }> = [];
  const seenCandidates = new Set<string>();
  const seenObjects = new Set<object>();
  let visitedValues = 0;

  const add = (candidate: ImageResponseCandidate, priority: number) => {
    const candidateKey = `${candidate.kind}:${candidate.value}`;
    if (seenCandidates.has(candidateKey)) return;
    seenCandidates.add(candidateKey);
    candidates.push({ ...candidate, priority });
  };

  const inspectString = (value: string, key: string | undefined, priority: number) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    for (const match of trimmed.matchAll(DATA_IMAGE_PATTERN)) {
      add({ kind: 'data-url', value: match[0] }, priority);
    }
    if (key && BASE64_VALUE_KEYS.test(key) && looksLikeBase64(trimmed)) {
      add({ kind: 'base64', value: trimmed, mimeType: 'image/png' }, priority + 1);
    }
    if (key && URL_VALUE_KEYS.test(key) && /^https?:\/\//i.test(trimmed)) {
      add({ kind: 'url', value: trimUrl(trimmed) }, priority + 2);
    }
    for (const match of trimmed.matchAll(MARKDOWN_IMAGE_PATTERN)) {
      add({ kind: 'url', value: trimUrl(match[1]) }, priority + 3);
    }
    for (const match of trimmed.matchAll(HTTP_URL_PATTERN)) {
      add({ kind: 'url', value: trimUrl(match[0]) }, priority + 4);
    }
  };

  const visit = (value: unknown, key?: string, depth = 0, priority = 20) => {
    if (depth > MAX_TRAVERSAL_DEPTH || visitedValues >= MAX_VISITED_VALUES) return;
    visitedValues += 1;
    if (typeof value === 'string') {
      inspectString(value, key, priority);
      return;
    }
    if (!value || typeof value !== 'object' || seenObjects.has(value)) return;
    seenObjects.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, depth + 1, priority));
      return;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Number(IMAGE_VALUE_KEYS.test(right)) - Number(IMAGE_VALUE_KEYS.test(left)));
    for (const [childKey, childValue] of entries) {
      const childPriority = IMAGE_VALUE_KEYS.test(childKey) ? Math.max(0, priority - 5) : priority + 1;
      visit(childValue, childKey, depth + 1, childPriority);
    }
  };

  visit(input);
  return candidates
    .sort((left, right) => left.priority - right.priority)
    .map(({ priority, ...candidate }) => {
      void priority;
      return candidate;
    });
}
