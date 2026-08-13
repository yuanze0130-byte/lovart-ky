import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import {
  assertDeclaredBodySize,
  enforceUserRateLimit,
  isAiToolRequestError,
  parseScriptWritingRequest,
  readLimitedJson,
} from '@/lib/ai-tool-request-guards';
import { isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';
import { AI_TOOL_CREDIT_COSTS, AI_TOOL_ESTIMATED_COST_MICROS } from '@/lib/ai-tool-pricing';

const MAX_REQUEST_BYTES = 64 * 1024;
const RATE_LIMIT = { limit: 8, windowMs: 60_000 } as const;

interface ScriptScene {
  scene: string;
  location: string;
  time: string;
  visual: string;
  action: string;
  dialogue: string;
  shot: string;
}

function parseJson(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as { title?: string; logline?: string; characters?: string[]; scenes?: ScriptScene[] };
  return {
    title: String(parsed.title || '未命名剧本'),
    logline: String(parsed.logline || ''),
    characters: Array.isArray(parsed.characters) ? parsed.characters.map(String).slice(0, 12) : [],
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes.slice(0, 30).map((scene, index) => ({
      scene: String(scene.scene || `场 ${index + 1}`),
      location: String(scene.location || ''),
      time: String(scene.time || ''),
      visual: String(scene.visual || ''),
      action: String(scene.action || ''),
      dialogue: String(scene.dialogue || ''),
      shot: String(scene.shot || ''),
    })) : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    assertDeclaredBodySize(request, MAX_REQUEST_BYTES);
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'script-writing', RATE_LIMIT);
    const body = parseScriptWritingRequest(await readLimitedJson(request, MAX_REQUEST_BYTES));
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('XAI_API_KEY not configured');
    const model = process.env.SCRIPT_WRITING_MODEL || process.env.XAI_MODEL || 'gpt-4o';
    const requestId = randomUUID();
    const { result, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'script-writing',
      creditCost: AI_TOOL_CREDIT_COSTS.scriptWriting,
      estimatedCostMicros: AI_TOOL_ESTIMATED_COST_MICROS.scriptWriting,
      creditType: 'script_writing',
      description: 'AI 剧本创作',
      referenceType: 'script_writing',
      meta: { model, durationMinutes: body.durationMinutes },
      run: async () => {
        const client = new OpenAI({ apiKey, baseURL: process.env.XAI_BASE_URL || 'https://ai.comfly.org/v1', timeout: 360000 });
        const completion = await client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你是专业编剧、导演和分镜师。返回 JSON：{"title":"片名","logline":"一句话梗概","characters":["角色：设定"],"scenes":[{"scene":"场次","location":"地点","time":"日/夜","visual":"画面描述","action":"动作与剧情","dialogue":"台词/旁白","shot":"景别与运镜"}]}。剧情必须完整，节奏清晰，场景可直接用于分镜和 AI 出图。只返回 JSON。',
            },
            {
              role: 'user',
              content: `类型：${body.genre}\n目标时长：${body.durationMinutes} 分钟\n角色设定：${body.characters || '请自行设计'}\n创作要求：${body.brief}`,
            },
          ],
        }, { signal: request.signal });
        const parsed = parseJson(completion.choices[0]?.message?.content || '{}');
        if (parsed.scenes.length === 0) throw new Error('模型未返回可用的剧本场次');
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
    return NextResponse.json({ error: '剧本创作失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
}
