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

        console.log('Starting image generation:', prompt);

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

        // 构建消息内容
        const messageContent: any[] = [
            { type: 'text', text: prompt }
        ];

        // 如果有参考图片，加入消息
        if (referenceImage) {
            let imageUrl = referenceImage;
            if (!referenceImage.startsWith('data:')) {
                imageUrl = `data:${mimeType || 'image/jpeg'};base64,${referenceImage}`;
            }
            messageContent.push({
                type: 'image_url',
                image_url: { url: imageUrl }
            });
        }

        const response = await client.chat.completions.create({
            model: process.env.GEMINI_MODEL || 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: messageContent,
                }
            ],
        });

        const textResponse = response.choices[0]?.message?.content || '';

        // 检查返回内容里是否有 base64 图片
        const base64Match = textResponse.match(/data:image\/[^;]+;base64,[^\s"]+/);
        if (base64Match) {
            return NextResponse.json({
                imageData: base64Match[0],
                textResponse,
            });
        }

        // 如果没有图片数据，返回文字内容（调试用）
        return NextResponse.json({
            imageData: null,
            textResponse,
            error: 'No image data returned, check model support'
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
