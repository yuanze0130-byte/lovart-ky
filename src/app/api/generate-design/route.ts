import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { prompt } = await request.json();

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

    const completion = await client.chat.completions.create({
      model: process.env.XAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            "You are a professional design assistant. Based on user's description, provide detailed design suggestions including layout, colors, typography, and visual elements. Be specific and creative.",
        },
        {
          role: 'user',
          content: `Create a design concept for: ${prompt}`,
        },
      ],
    });

    const designSuggestion = completion.choices[0]?.message?.content ?? '未收到回复';

    return NextResponse.json({
      suggestion: designSuggestion,
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
