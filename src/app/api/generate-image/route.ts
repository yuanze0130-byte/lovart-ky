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

        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const client = new OpenAI({ apiKey, baseURL });

        // 如果包含中文，先翻译成英文
        const hasChinese = /[\u4e00-\u9fff]/.test(prompt);
        let finalPrompt = prompt;

        if (hasChinese) {
            const translateRes = await client.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: `Translate the following image generation prompt to English. Only return the translated prompt, nothing else:\n${prompt}`
                }],
            });
            finalPrompt = translateRes.choices[0]?.message?.content?.trim() || prompt;
        }

        const content: any[] = [];

        if (referenceImage) {
            const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
            content.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Data}` }
            });
        }

        content.push({ type: 'text', text: finalPrompt });

        const response = await client.chat.completions.create({
            model: 'gemini-3.1-flash-image-preview',
            messages: [{ role: 'user', content }],
        }) as any;

        // 检查 inlineData 格式（Gemini 原生）
        const parts = response.choices[0]?.message?.parts;
        if (parts && Array.isArray(parts)) {
            for (const part of parts) {
                if (part.inlineData?.data) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    return NextResponse.json({
                        imageData: `data:${mimeType};base64,${part.inlineData.data}`,
                        textResponse: '',
                    });
                }
            }
        }

        // 检查标准 content 字段
        const messageContent = response.choices[0]?.message?.content;

        if (messageContent) {
            // 检查 base64 格式
            const base64Match = messageContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
            if (base64Match) {
                return NextResponse.json({
                    imageData: base64Match[0],
                    textResponse: '',
                });
            }

            // 检查返回的是图片 URL（t8star 返回 markdown 格式的图片链接）
            const urlMatch = messageContent.match(/https?:\/\/[^\s\)]+\.(jpg|jpeg|png|webp|gif)/i);
            if (urlMatch) {
                return NextResponse.json({
                    imageData: urlMatch[0],
                    textResponse: '',
                });
            }

            // 纯 base64 字符串
            const trimmed = messageContent.trim();
            if (trimmed.length > 200 && !/\s/.test(trimmed)) {
                return NextResponse.json({
                    imageData: `data:image/png;base64,${trimmed}`,
                    textResponse: '',
                });
            }

            console.log('Model returned text:', messageContent.slice(0, 500));
            return NextResponse.json({
                error: '模型返回了文字而非图片',
                details: messageContent.slice(0, 300),
            }, { status: 500 });
        }

        console.log('Full response:', JSON.stringify(response, null, 2));
        return NextResponse.json(
            { error: 'No image data in response' },
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
