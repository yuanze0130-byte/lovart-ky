import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import {
  assertDeclaredBodySize,
  enforceUserRateLimit,
  isAiToolRequestError,
  parseVideoBreakdownRequest,
  readLimitedJson,
} from '@/lib/ai-tool-request-guards';
import { isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';
import { AI_TOOL_CREDIT_COSTS, AI_TOOL_ESTIMATED_COST_MICROS } from '@/lib/ai-tool-pricing';

const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT = { limit: 4, windowMs: 60_000 } as const;

interface VideoBreakdownRow {
  timestamp: string;
  shot: string;
  visual: string;
  camera: string;
  narration: string;
}

function parseJsonContent(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as { summary?: string; rows?: VideoBreakdownRow[] };
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    rows: Array.isArray(parsed.rows) ? parsed.rows.slice(0, 20).map((row, index) => ({
      timestamp: String(row.timestamp || ''),
      shot: String(row.shot || `镜头 ${index + 1}`),
      visual: String(row.visual || ''),
      camera: String(row.camera || ''),
      narration: String(row.narration || ''),
    })) : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    assertDeclaredBodySize(request, MAX_REQUEST_BYTES);
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'video-breakdown', RATE_LIMIT);
    const body = parseVideoBreakdownRequest(await readLimitedJson(request, MAX_REQUEST_BYTES));
    const frames = body.frames;

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('XAI_API_KEY not configured');
    const model = process.env.VIDEO_ANALYSIS_MODEL || process.env.XAI_MODEL || 'gpt-4o';
    const requestId = randomUUID();
    const { result, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'video-breakdown',
      creditCost: AI_TOOL_CREDIT_COSTS.videoBreakdown,
      estimatedCostMicros: AI_TOOL_ESTIMATED_COST_MICROS.videoBreakdown,
      creditType: 'video_breakdown',
      description: 'AI 视频拆解',
      referenceType: 'video_breakdown',
      meta: { model, frameCount: frames.length },
      run: async () => {
        const client = new OpenAI({ apiKey, baseURL: process.env.XAI_BASE_URL || 'https://ai.comfly.org/v1', timeout: 360000 });
        const completion = await client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你是影视导演和剪辑师。根据按时间顺序提供的视频关键帧，返回 JSON：{"summary":"整体内容概括","rows":[{"timestamp":"00:00.0","shot":"镜头编号/景别","visual":"画面内容","camera":"机位与运镜","narration":"可用旁白/台词"}]}。只返回 JSON，不要 Markdown。',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `视频时长：${body.duration.toFixed(1)} 秒\n额外要求：${body.prompt || '无'}\n请按所给时间标签逐镜头拆解。` },
                ...frames.flatMap((frame) => [
                  { type: 'text' as const, text: `关键帧 ${frame.label || ''}` },
                  { type: 'image_url' as const, image_url: { url: frame.dataUrl as string, detail: 'low' as const } },
                ]),
              ],
            },
          ],
        }, { signal: request.signal });
        const parsed = parseJsonContent(completion.choices[0]?.message?.content || '{}');
        if (parsed.rows.length === 0) throw new Error('模型未返回可用的视频拆解结果');
        return parsed;
      },
    });
    return NextResponse.json({ ...result, billing });
  } catch (error) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    return NextResponse.json({ error: '视频拆解失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
}
