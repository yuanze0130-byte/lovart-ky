import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { prompt, referenceImage } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const baseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';
        const model = process.env.IMAGE_MODEL || 'gemini-3.1-flash-image-preview-2k';

        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const client = new OpenAI({ apiKey, baseURL });

        // 构建消息内容
        const content: any[] = [];

        if (referenceImage) {
            const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
            content.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Data}` }
            });
        }

        content.push({ type: 'text', text: prompt });

        // 用 chat completions 接口调用 Gemini 图像模型
        const response = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content }],
        });

        const messageContent = response.choices[0]?.message?.content;

        // 尝试从响应中提取 base64 图片
        if (messageContent) {
            // 检查是否包含 base64 图片数据
            const base64Match = messageContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
            if (base64Match) {
                return NextResponse.json({
                    imageData: base64Match[0],
                    textResponse: '',
                });
            }

            // 有些模型返回纯 base64 字符串
            if (messageContent.length > 100 && !messageContent.includes(' ')) {
                return NextResponse.json({
                    imageData: `data:image/png;base64,${messageContent}`,
                    textResponse: '',
                });
            }

            // 返回了文字说明没有生成图片
            return NextResponse.json({
                error: '模型返回了文字而非图片，请检查模型名称是否支持图像生成',
                details: messageContent.slice(0, 200),
            }, { status: 500 });
        }

        return NextResponse.json(
            { error: 'No response from model' },
            { status: 500 }
        );

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
