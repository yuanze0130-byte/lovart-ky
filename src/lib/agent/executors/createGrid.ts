import type { NextRequest } from 'next/server';
import type { AgentActionResult, AgentContext, CreateGridAction, StoryboardAspectRatio } from '@/lib/agent/actions';
import { runGenerateImagesAction } from './generateImages';

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
  userId: string;
}): Promise<AgentActionResult> {
  void input.context;

  const count = input.action.count ?? 9;
  const aspectRatio = getGridAspectRatio(count, input.action.aspectRatio);
  const variations = GRID_VARIATIONS[count];
  const prompts = variations.map((variation,index) => `${input.action.prompt}\n\n${variation}。第 ${index+1}/${count} 张，保持整体风格统一，构图与机位有明确差异。`);
  const result = await runGenerateImagesAction({ ...input, action: { type: 'generate_images', prompt: input.action.prompt, aspectRatio }, prompts, useSelectedReference: false });
  const images = result.images;
  return {
    ...result,
    assetIds: images.map((item) => item.assetId),
    images,
    count: images.length,
    message: result.incomplete ? result.message : `已生成 ${images.length} 张${count === 25 ? '连贯分镜' : count === 4 ? '剧情推演四宫格' : '九宫格视觉探索'}`,
    layout: {
      kind: 'grid',
      columns: count === 4 ? 2 : count === 25 ? 5 : 3,
      rows: count === 4 ? 2 : count === 25 ? 5 : 3,
      gap: count === 25 ? 18 : 28,
      title: count === 25 ? '25宫格连贯分镜' : count === 4 ? '四宫格剧情推演' : '九宫格视觉探索',
      labels: images.map((image, index) => String(image.agentStep || index + 1).padStart(2, '0')),
    },
  };
}
