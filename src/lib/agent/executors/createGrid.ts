import type { NextRequest } from 'next/server';
import type { AgentActionResult, AgentContext, CreateGridAction, StoryboardAspectRatio } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';

type GenerateImageApiResult = {
  imageData?: string;
  error?: string;
};

const GRID_VARIATIONS: Record<4 | 9 | 25, string[]> = {
  4: [
    '建立世界观的广角开场，清晰主体，电影感构图',
    '关键动作推进，主体姿态更有叙事张力',
    '细节或情绪特写，强调材质、表情、光影',
    '结果或反转画面，形成下一步创作方向',
  ],
  9: [
    '正面主视觉，商业广告构图',
    '45度侧面视角，强调轮廓和材质',
    '俯视或高机位，展示空间关系',
    '低机位英雄视角，增强力量感',
    '细节特写，突出关键卖点',
    '环境融合版本，主体处于完整场景中',
    '冷色高级光影版本',
    '暖色情绪光影版本',
    '极简海报版本，留白和标题空间明显',
  ],
  25: Array.from({ length: 25 }, (_, index) => `连贯分镜第 ${index + 1} 格，保持角色/主体一致性，镜头节奏自然推进`),
};

function getGridAspectRatio(count: 4 | 9 | 25, fallback?: StoryboardAspectRatio): StoryboardAspectRatio {
  if (fallback) return fallback;
  if (count === 9) return '1:1';
  return '16:9';
}

export async function runCreateGridAction(input: {
  request: NextRequest;
  action: CreateGridAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  void input.context;

  const count = input.action.count ?? 9;
  const aspectRatio = getGridAspectRatio(count, input.action.aspectRatio);
  const variations = GRID_VARIATIONS[count];
  const images: Array<{ assetId: string; imageData: string; prompt: string }> = [];
  const now = Date.now();

  for (let index = 0; index < count; index += 1) {
    const prompt = `${input.action.prompt}\n\n${variations[index]}。作为 ${count === 25 ? '25宫格连贯分镜' : count === 4 ? '四宫格剧情推演' : '九宫格视觉探索'} 的第 ${index + 1}/${count} 张，保持整体风格统一，但构图、机位或情绪有明确差异。`;
    const result = await callInternalJson<GenerateImageApiResult>(input.request, '/api/generate-image', {
      prompt,
      resolution: '1K',
      aspectRatio,
      modelVariant: 'pro',
      editMode: 'generate',
    });

    if (!result.imageData) {
      throw new Error(result.error || `${count} 宫格第 ${index + 1} 张生成失败`);
    }

    images.push({
      assetId: `agent-grid-${count}-${index + 1}-${now}`,
      imageData: result.imageData,
      prompt,
    });
  }

  return {
    kind: 'images_generated',
    assetIds: images.map((item) => item.assetId),
    images,
    count: images.length,
    message: `已生成 ${images.length} 张${count === 25 ? '连贯分镜' : count === 4 ? '剧情推演四宫格' : '九宫格视觉探索'}`,
    layout: {
      kind: 'grid',
      columns: count === 4 ? 2 : count === 25 ? 5 : 3,
      rows: count === 4 ? 2 : count === 25 ? 5 : 3,
      gap: count === 25 ? 18 : 28,
      title: count === 25 ? '25宫格连贯分镜' : count === 4 ? '四宫格剧情推演' : '九宫格视觉探索',
      labels: images.map((_, index) => String(index + 1).padStart(2, '0')),
    },
  };
}
