import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { prompt, referenceImage, mimeType } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const baseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';

        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
        });

        // 使用图片生成接口
        const response = await client.images.generate({
            model: process.env.IMAGE_MODEL || 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
        });

        const imageBase64 = response.data[0]?.b64_json;

        if (!imageBase64) {
            return NextResponse.json(
                { error: 'No image was generated' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            imageData: `data:image/png;base64,${imageBase64}`,
            textResponse: '',
        });

    } catch (error: any) {
        console.error('Error generating image:', error);
        return NextResponse.json(
            {
                error: 'Failed to generate image',
                details: error.message || 'Unknown error',
            },
            { status: 500 }
        );
    }
}
