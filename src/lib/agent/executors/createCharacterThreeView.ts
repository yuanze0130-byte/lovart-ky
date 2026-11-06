import type { NextRequest } from 'next/server';
import type { AgentActionResult, AgentContext, CreateCharacterThreeViewAction } from '@/lib/agent/actions';
import { runGenerateImagesAction } from './generateImages';

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
  userId: string;
}): Promise<AgentActionResult> {
  void input.context;

  const aspectRatio = input.action.aspectRatio || '1:1';
  const prompts = THREE_VIEW_SHOTS.map(shot => `${input.action.prompt}\n\n${shot.prompt}。这是 ${shot.label} 视角，请保持角色身份、服装和配色一致。`);
  const result = await runGenerateImagesAction({ ...input, action: { type: 'generate_images', prompt: input.action.prompt, aspectRatio }, prompts, useSelectedReference: false });
  const images = result.images;
  return {
    ...result,
    assetIds: images.map((item) => item.assetId),
    images,
    count: images.length,
    message: result.incomplete ? result.message : `已生成 ${images.length} 张角色视图`,
    layout: {
      kind: 'character_three_view',
      columns: 3,
      rows: 1,
      gap: 32,
      title: '角色三视图',
      labels: images.map((image,index) => ['Front 正面', 'Side 侧面', 'Back 背面'][(image.agentStep || index+1)-1]),
    },
  };
}
