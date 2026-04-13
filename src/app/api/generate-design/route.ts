import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/require-user';

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);
    const { prompt, mode } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.XAI_API_KEY;
    const baseURL = process.env.XAI_BASE_URL || 'https://ai.t8star.cn/v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'XAI_API_KEY not configured' }, { status: 500 });
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 360000,
    });

    const systemPrompts: Record<string, string> = {
      design: "You are a professional design agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Keep coordinates simple and canvas-friendly.",
      branding: "You are a senior branding agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on brand strategy, positioning, identity, tone, palette, and extension ideas.",
      'image-editing': "You are an image editing agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on edit goals, operations, before/after intent, and execution order.",
      research: "You are a creative research agent. Return a JSON object only. The JSON must include: summary (string), reply (string), and plan (object). plan may include: layout (string), sections (array of {title,body}), createTextNodes (array of {content,x,y,fontSize}), createImageGenerator (boolean), createVideoGenerator (boolean), recommendedTitle (string). Focus on references, style keywords, competitor directions, and inspiration cues.",
    };

    const resolvedMode = typeof mode === 'string' && mode in systemPrompts ? mode : 'design';

    const completion = await client.chat.completions.create({
      model: process.env.XAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompts[resolvedMode],
        },
        {
          role: 'user',
          content: `Mode: ${resolvedMode}\n\nUser goal: ${prompt}`,
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

    return NextResponse.json({
      suggestion: typeof parsed.reply === 'string' ? parsed.reply : rawContent,
      summary: typeof parsed.summary === 'string' ? parsed.summary : (typeof parsed.reply === 'string' ? parsed.reply : rawContent),
      plan: parsed.plan && typeof parsed.plan === 'object' ? parsed.plan : {},
    });
  } catch (error: unknown) {
    console.error('Error generating design:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to generate design',
        details: message,
      },
      { status: 500 }
    );
  }
}
