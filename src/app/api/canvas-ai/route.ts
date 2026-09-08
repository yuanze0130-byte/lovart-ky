import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { requireUser, isNotAuthenticatedError } from '@/lib/require-user';
import { assertDeclaredBodySize, readLimitedJson, enforceUserRateLimit, isAiToolRequestError, AiToolRequestError } from '@/lib/ai-tool-request-guards';
import { runMeteredAiOperation, isAiSafetyError } from '@/lib/ai-safety';
import { parseCanvasAiRequest, parseAiTableResult } from '@/lib/canvas-ai';
import { getCanvasAiModels } from '@/lib/canvas-ai-models.server';
import { tableToMarkdown } from '@/lib/table-editor';

export const runtime = 'nodejs';
const MAX_BYTES = 10 * 1024 * 1024;

function failure(error: unknown) {
  if (isNotAuthenticatedError(error)) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (isAiToolRequestError(error) || isAiSafetyError(error)) return NextResponse.json({ error: error.message, code: error.code }, {
    status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
  });
  // Upstream responses may contain routing details. Do not send them to the browser.
  return NextResponse.json({ error: '节点生成失败，请稍后重试或检查模型配置' }, { status: 502 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return NextResponse.json({ models: getCanvasAiModels().map(({ id, label, vision, credits }) => ({ id, label, vision, credits })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertDeclaredBodySize(request, MAX_BYTES);
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-ai', { limit: 8, windowMs: 60_000 });
    const body = parseCanvasAiRequest(await readLimitedJson(request, MAX_BYTES));
    const models = getCanvasAiModels();
    const model = body.model ? models.find((item) => item.id === body.model) : models[0];
    if (!model) throw new AiToolRequestError('该模型未在服务器开放，请重新选择', 400, 'MODEL_NOT_ALLOWED');
    if (body.expectedCredits !== model.credits) throw new AiToolRequestError('模型价格已变更，请刷新模型并确认价格后重试', 409, 'MODEL_PRICE_CHANGED');
    if (body.images.length && !model.vision) throw new AiToolRequestError('该模型不支持图片，请选择视觉模型', 400, 'VISION_NOT_SUPPORTED');
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('Missing upstream configuration');
    const system = body.mode === 'table'
      ? '你是表格整理助手。按照用户要求整理原文，不捏造原文没有的事实。只返回 JSON：{"columns":["列名"],"rows":[["单元格"]]}。最多20列、100行，每行列数一致，所有单元格为字符串。'
      : body.mode === 'agent'
        ? body.systemPrompt || '你是画布内容处理助手。分析上游素材，按任务要求输出可直接给下游使用的内容。不要声称执行了画布操作。'
        : '你是画布文字与提示词助手。按用户要求生成或改写文字；有参考图片时根据画面分析。视频以有限关键帧呈现，不声称听到了音频或看到了未提供的片段。只输出所需内容。';
    const text = `任务要求：${body.instruction || '分析素材并输出清晰的描述'}\n\n上游内容：\n${body.source || '无文字输入'}`;
    const { result, billing } = await runMeteredAiOperation({
      requestId: randomUUID(), userId: user.id, scope: 'canvas-ai',
      creditCost: model.credits, estimatedCostMicros: model.estimatedCostMicros,
      creditType: 'agent_chat', description: `画布 AI ${body.mode === 'table' ? '表格' : body.mode === 'agent' ? 'Agent' : '文本'}`,
      referenceType: 'canvas_ai', meta: { model: model.id, mode: body.mode },
      run: async () => {
        const client = new OpenAI({ apiKey, baseURL: process.env.XAI_BASE_URL || 'https://ai.comfly.org/v1', timeout: 180000, maxRetries: 0 });
        const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text }];
        body.images.forEach((image) => {
          content.push({ type: 'text', text: image.label });
          content.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'low' } });
        });
        const completion = await client.chat.completions.create({
          model: model.id, max_tokens: 4096,
          messages: [{ role: 'system', content: system }, { role: 'user', content }],
        }, { signal: request.signal });
        if (completion.choices[0]?.finish_reason === 'length') throw new Error('Output truncated');
        const output = completion.choices[0]?.message?.content?.trim();
        if (!output) throw new Error('Empty model output');
        if (body.mode !== 'table') return { text: output };
        const table = parseAiTableResult(output);
        return { text: tableToMarkdown(table.columns, table.rows), table };
      },
    });
    return NextResponse.json({ ...result, billing });
  } catch (error) { return failure(error); }
}
