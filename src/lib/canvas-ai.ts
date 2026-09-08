import { AiToolRequestError } from './ai-tool-request-guards';

export type CanvasAiMode = 'text' | 'table' | 'agent';
export interface CanvasAiModel {
  id: string;
  label: string;
  vision: boolean;
  credits: number;
}
export interface CanvasAiRequest {
  mode: CanvasAiMode;
  model: string;
  expectedCredits: number;
  instruction: string;
  source: string;
  systemPrompt: string;
  images: Array<{ dataUrl: string; label: string }>;
}

export function parseCanvasAiRequest(value: unknown): CanvasAiRequest {
  const fail = (message: string): never => { throw new AiToolRequestError(message, 400, 'INVALID_CANVAS_AI_REQUEST'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('请求格式无效');
  const body = value as Record<string, unknown>;
  const string = (key: string, max: number) => {
    const item = body[key] ?? '';
    if (typeof item !== 'string' || item.length > max) return fail(`${key} 格式无效或内容过长`);
    return item.trim();
  };
  if (!['text', 'table', 'agent'].includes(String(body.mode))) return fail('不支持的节点模式');
  const instruction = string('instruction', 8000);
  const source = string('source', 24000);
  const systemPrompt = string('systemPrompt', 4000);
  const model = string('model', 120);
  const expectedCredits = body.expectedCredits;
  if (!Number.isSafeInteger(expectedCredits) || (expectedCredits as number) < 1) return fail('请刷新模型报价后再试');
  const rawImages = body.images ?? [];
  if (!Array.isArray(rawImages) || rawImages.length > 6) return fail('最多支持 6 张图片或视频关键帧');
  const images = rawImages.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return fail('图片格式无效');
    const image = raw as Record<string, unknown>;
    if (typeof image.dataUrl !== 'string' || image.dataUrl.length > 1_500_000
      || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)) return fail('图片必须是大小受限的 JPEG、PNG 或 WebP 数据');
    if (typeof image.label !== 'string' || image.label.length > 120) return fail('图片标签无效');
    return { dataUrl: image.dataUrl, label: image.label };
  });
  if (!instruction && !source && images.length === 0) return fail('请输入要求或连接上游素材');
  if (body.mode === 'table' && !source) return fail('请先提供需要整理的文字');
  return { mode: body.mode as CanvasAiMode, model, expectedCredits: expectedCredits as number, instruction, source, systemPrompt, images };
}

export function parseAiTableResult(content: string) {
  const parsed: unknown = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!parsed || typeof parsed !== 'object') throw new Error('模型没有返回表格');
  const { columns, rows } = parsed as Record<string, unknown>;
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > 20
    || !columns.every((column) => typeof column === 'string' && column.trim() && column.length <= 100)
    || !Array.isArray(rows) || rows.length === 0 || rows.length > 100
    || !rows.every((row) => Array.isArray(row) && row.length === columns.length
      && row.every((cell) => typeof cell === 'string' && cell.length <= 4000))) {
    throw new Error('模型返回的表格结构无效，请重试或减少输入内容');
  }
  return { columns: columns as string[], rows: rows as string[][] };
}
