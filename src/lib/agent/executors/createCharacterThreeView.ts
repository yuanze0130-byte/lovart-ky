import type { NextRequest } from 'next/server';
import type { AgentActionResult, AgentContext, CreateCharacterThreeViewAction } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';

type GenerateImageApiResult = {
  imageData?: string;
  error?: string;
};

const THREE_VIEW_SHOTS = [
  {
    label: 'Front',
    prompt: '角色正面三视图，T-pose 或自然站姿，完整身体比例，服装和脸部清晰，白色或浅灰背景，角色设定图风格',
  },
  {
    label: 'Side',
    prompt: '角色侧面三视图，完整身体比例，与正面保持同一角色、服装、发型和材质，白色或浅灰背景，角色设定图风格',
  },
  {
    label: 'Back',
    prompt: '角色背面三视图，完整身体比例，展示背部轮廓、服装结构和装备细节，与正面保持同一角色，白色或浅灰背景，角色设定图风格',
  },
] as const;

export async function runCreateCharacterThreeViewAction(input: {
  request: NextRequest;
  action: CreateCharacterThreeViewAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  void input.context;

  const aspectRatio = input.action.aspectRatio || '1:1';
  const now = Date.now();
  const images: Array<{ assetId: string; imageData: string; prompt: string }> = [];

  for (let index = 0; index < THREE_VIEW_SHOTS.length; index += 1) {
    const shot = THREE_VIEW_SHOTS[index];
    const prompt = `${input.action.prompt}\n\n${shot.prompt}。这是角色三视图的 ${shot.label} 视角，请保持三张图之间角色身份、服装、配色、发型、体型和关键道具一致。`;
    const result = await callInternalJson<GenerateImageApiResult>(input.request, '/api/generate-image', {
      prompt,
      resolution: '1K',
      aspectRatio,
      modelVariant: 'pro',
      editMode: 'generate',
    });

    if (!result.imageData) {
      throw new Error(result.error || `角色三视图 ${shot.label} 生成失败`);
    }

    images.push({
      assetId: `agent-character-3view-${shot.label.toLowerCase()}-${now}`,
      imageData: result.imageData,
      prompt,
    });
  }

  return {
    kind: 'images_generated',
    assetIds: images.map((item) => item.assetId),
    images,
    count: images.length,
    message: '已生成角色三视图：正面 / 侧面 / 背面',
    layout: {
      kind: 'character_three_view',
      columns: 3,
      rows: 1,
      gap: 32,
      title: '角色三视图',
      labels: ['Front 正面', 'Side 侧面', 'Back 背面'],
    },
  };
}
