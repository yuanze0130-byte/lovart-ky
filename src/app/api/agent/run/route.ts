import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import type { AgentMode, AgentRunRequest, AgentRunResponse } from '@/lib/agent/actions';
import { classifyAgentIntent } from '@/lib/agent/intent';
import { parseAgentCommand } from '@/lib/agent/parseAgentCommand';
import { executeAgentAction } from '@/lib/agent/executeAgentAction';

const CHAT_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  design: "You are a professional design agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Keep coordinates simple and canvas-friendly.",
  branding: "You are a senior branding agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on brand strategy, positioning, identity, tone, palette, and extension ideas.",
  'image-editing': "You are an image editing agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on edit goals, operations, before/after intent, and execution order.",
  research: "You are a creative research agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on references, style keywords, competitor directions, and inspiration cues.",
};

async function runAgentChat(message: string, mode?: string) {
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
  });

  const rawContent = completion.choices[0]?.message?.content ?? '{"reply":"未收到回复","summary":"未收到回复","plan":{}}';

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
    const body = (await request.json()) as AgentRunRequest;

    if (!body?.message || typeof body.message !== 'string') {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Missing agent message' }, { status: 400 });
    }

    if (!body?.context || typeof body.context !== 'object') {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Missing agent context' }, { status: 400 });
    }

    if (classifyAgentIntent({ message: body.message, context: body.context }) === 'chat') {
      const chat = await runAgentChat(body.message, body.mode);
      return NextResponse.json<AgentRunResponse>({
        ok: true,
        chat,
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
    return NextResponse.json<AgentRunResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown agent error',
      },
      { status: 500 },
    );
  }
}
