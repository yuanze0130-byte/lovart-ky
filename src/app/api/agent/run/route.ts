import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import type { AgentMode, AgentRunRequest, AgentRunResponse } from '@/lib/agent/actions';
import { classifyAgentIntent } from '@/lib/agent/intent';
import { parseAgentCommand } from '@/lib/agent/parseAgentCommand';
import { executeAgentAction } from '@/lib/agent/executeAgentAction';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';
import { AI_TOOL_CREDIT_COSTS, AI_TOOL_ESTIMATED_COST_MICROS } from '@/lib/ai-tool-pricing';

const CHAT_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  design: "You are a professional design agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Keep coordinates simple and canvas-friendly. When suggesting image generation, default to a single image unless the user explicitly asks for multiple outputs.",
  branding: "You are a senior branding agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on brand strategy, positioning, identity, tone, palette, and extension ideas. When suggesting image generation, default to a single image unless the user explicitly asks for multiple outputs.",
  'image-editing': "You are an image editing agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on edit goals, operations, before/after intent, and execution order. When suggesting image generation, default to a single image unless the user explicitly asks for multiple outputs.",
  research: "You are a creative research agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on references, style keywords, competitor directions, and inspiration cues. When suggesting image generation, default to a single image unless the user explicitly asks for multiple outputs.",
};

async function runAgentChat(message: string, mode: string | undefined, signal: AbortSignal) {
  const apiKey = process.env.XAI_API_KEY;
  const baseURL = process.env.XAI_BASE_URL || 'https://ai.t8star.cn/v1';

  if (!apiKey) {
    throw new Error('XAI_API_KEY not configured');
  }

  const resolvedMode = (typeof mode === 'string' && mode in CHAT_SYSTEM_PROMPTS ? mode : 'design') as keyof typeof CHAT_SYSTEM_PROMPTS;

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 360000,
  });

  const completion = await client.chat.completions.create({
    model: process.env.XAI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: CHAT_SYSTEM_PROMPTS[resolvedMode],
      },
      {
        role: 'user',
        content: `Mode: ${resolvedMode}\n\nUser goal: ${message}`,
      },
    ],
  }, { signal });

  const rawContent = completion.choices?.[0]?.message?.content ?? '{"reply":"未收到回复","summary":"未收到回复","plan":{}}';

  let parsed: { summary?: string; reply?: string; plan?: Record<string, unknown> };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = {
      summary: rawContent,
      reply: rawContent,
      plan: {},
    };
  }

  return {
    kind: 'chat' as const,
    reply: typeof parsed.reply === 'string' ? parsed.reply : rawContent,
    summary: typeof parsed.summary === 'string' ? parsed.summary : (typeof parsed.reply === 'string' ? parsed.reply : rawContent),
    plan: parsed.plan && typeof parsed.plan === 'object' ? parsed.plan : {},
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'agent-run', { limit: 12, windowMs: 60_000 });
    const body = await readLimitedJson(request, 512 * 1024) as AgentRunRequest;

    if (!body?.message || typeof body.message !== 'string' || body.message.length > 5_000) {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Missing agent message' }, { status: 400 });
    }

    if (!body?.context || typeof body.context !== 'object') {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Missing agent context' }, { status: 400 });
    }

    if (classifyAgentIntent({ message: body.message, context: body.context }) === 'chat') {
      const requestId = randomUUID();
      const { result: chat, billing } = await runMeteredAiOperation({
        requestId,
        userId: user.id,
        scope: 'agent-chat',
        creditCost: AI_TOOL_CREDIT_COSTS.agentChat,
        estimatedCostMicros: AI_TOOL_ESTIMATED_COST_MICROS.agentChat,
        creditType: 'agent_chat',
        description: 'Agent 创意对话',
        referenceType: 'agent_chat',
        meta: { model: process.env.XAI_MODEL || 'gpt-4o', mode: body.mode || 'design' },
        run: () => runAgentChat(body.message, body.mode, request.signal),
      });
      return NextResponse.json<AgentRunResponse>({
        ok: true,
        chat,
        billing,
      });
    }

    const action = await parseAgentCommand({
      message: body.message,
      context: body.context,
      userId: user.id,
    });

    const result = await executeAgentAction({
      request,
      userId: user.id,
      action,
      context: body.context,
    });

    return NextResponse.json<AgentRunResponse>({
      ok: true,
      action,
      result,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiSafetyError(error) || isAiToolRequestError(error)) {
      return NextResponse.json<AgentRunResponse>(
        { ok: false, error: error.message },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
    return NextResponse.json<AgentRunResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown agent error',
      },
      { status: 500 },
    );
  }
}
