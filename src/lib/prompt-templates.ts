export type PromptTemplateCategory = 'ecommerce' | 'social' | 'branding' | 'interior' | 'character' | 'video';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';
type BananaVariant = 'standard' | 'pro' | 'gpt-image-2' | 'gpt-image-2-official';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';

export type PromptTemplateResolution = Resolution;
export type PromptTemplateAspectRatio = AspectRatio;
export type PromptTemplateModelVariant = BananaVariant;
export type PromptTemplateImageMode = ImageEditMode;

export interface PromptTemplate {
  id: string;
  title: string;
  category: PromptTemplateCategory;
  summary: string;
  prompt: string;
  suggestedAspectRatios?: PromptTemplateAspectRatio[];
  defaultAspectRatio?: PromptTemplateAspectRatio;
  recommendedResolution?: PromptTemplateResolution;
  recommendedModelVariant?: PromptTemplateModelVariant;
  recommendedImageMode?: PromptTemplateImageMode;
  variables?: string[];
  suggestedModes?: Array<'design' | 'branding' | 'image-editing' | 'research'>;
  suggestedImageModes?: PromptTemplateImageMode[];
}

export function extractTemplateVariables(prompt: string): string[] {
  const matches = prompt.match(/【([^】]+)】/g) ?? [];
  const cleaned = matches.map((item) => item.slice(1, -1).trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

export const PROMPT_TEMPLATE_CATEGORY_LABELS: Record<PromptTemplateCategory, string> = {
  ecommerce: '电商',
  social: '社媒',
  branding: '品牌',
  interior: '空间',
  character: '角色',
  video: '视频',
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'ecom-main-kv',
    title: '电商主图 KV',
    category: 'ecommerce',
    summary: '适合新品首图、平台主图、爆款视觉。',
    prompt: '请为【产品名称】生成一张高转化电商主图：主体居中突出，材质细节清晰，背景干净但有高级层次，整体视觉适合首页首屏；请同时兼顾点击率、品牌质感与平台审美。',
    suggestedAspectRatios: ['4:5', '1:1'],
    defaultAspectRatio: '4:5',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'generate',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate'],
  },
  {
    id: 'ecom-detail-sellpoints',
    title: '电商卖点细节图',
    category: 'ecommerce',
    summary: '适合做细节卖点、质感放大和功能说明图。',
    prompt: '请围绕【产品名称】生成一张卖点细节图：重点突出材质、结构、功能或工艺亮点，画面干净、信息明确，适合电商详情页；请保留商业化质感，并为后续加文案留出安全区域。',
    suggestedAspectRatios: ['4:5', '3:4'],
    defaultAspectRatio: '4:5',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'enhance',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate', 'enhance'],
  },
  {
    id: 'xiaohongshu-cover',
    title: '小红书封面',
    category: 'social',
    summary: '高点击种草封面，突出标题和视觉记忆点。',
    prompt: '请为【主题/产品】生成一张适合小红书的封面：强标题感、信息明确、画面干净、带平台流行审美；请兼顾种草氛围、记忆点和留白区，适合后续叠加封面文案。',
    suggestedAspectRatios: ['3:4', '4:5'],
    defaultAspectRatio: '3:4',
    recommendedResolution: '1K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'generate',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate'],
  },
  {
    id: 'brand-moodboard',
    title: '品牌情绪板',
    category: 'branding',
    summary: '用于梳理品牌视觉方向、材质与氛围。',
    prompt: '请围绕【品牌名/品牌方向】生成一张品牌情绪板：包含色彩、材质、构图、排版气质和视觉语义，整体要像给品牌团队内部提案使用的方向图；请优先输出统一且可延展的视觉语言。',
    suggestedAspectRatios: ['16:9', '4:3'],
    defaultAspectRatio: '16:9',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'generate',
    suggestedModes: ['branding', 'design'],
    suggestedImageModes: ['generate'],
  },
  {
    id: 'interior-hero-shot',
    title: '空间主视觉',
    category: 'interior',
    summary: '适合室内设计、展陈、空间气氛方案。',
    prompt: '请围绕【空间类型】生成一张空间主视觉：强调整体构图、光影、材质和氛围，兼顾功能感与高级感；画面需要像设计提案中的 hero shot，能清楚传达空间气质。',
    suggestedAspectRatios: ['16:9', '21:9'],
    defaultAspectRatio: '16:9',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'background',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate', 'relight', 'background'],
  },
  {
    id: 'character-concept',
    title: '角色概念图',
    category: 'character',
    summary: '适合原创角色探索、IP 形象、设定发散。',
    prompt: '请围绕【角色设定】生成一张角色概念图：需要明确角色身份、服装层次、材质细节、姿态和氛围；整体既有辨识度又方便后续扩展为三视图、海报或短视频。',
    suggestedAspectRatios: ['2:3', '3:4'],
    defaultAspectRatio: '2:3',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'generate',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate', 'restyle'],
  },
  {
    id: 'video-storyboard-frame',
    title: '视频分镜关键帧',
    category: 'video',
    summary: '适合先做关键帧，再延展成视频镜头。',
    prompt: '请围绕【视频 brief】生成一张分镜关键帧：明确镜头构图、人物/主体位置、光线、景别和情绪；画面要像视频脚本中的关键视觉锚点，方便后续继续扩展成连续镜头。',
    suggestedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'generate',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate'],
  },
  {
    id: 'poster-launch-campaign',
    title: '新品发布海报',
    category: 'branding',
    summary: '适合发布会、首发宣传和 campaign KV。',
    prompt: '请为【品牌/产品】生成一张新品发布海报：需要有强主视觉、明确品牌气质、层次清楚的标题区域和适度戏剧化光影；整体像 campaign 主海报，可用于官网首屏或发布物料。',
    suggestedAspectRatios: ['4:5', '16:9'],
    defaultAspectRatio: '4:5',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'generate',
    suggestedModes: ['design', 'branding'],
    suggestedImageModes: ['generate'],
  },
  {
    id: 'packaging-hero-shot',
    title: '包装展示图',
    category: 'branding',
    summary: '适合包装提案、陈列效果和品牌展示。',
    prompt: '请围绕【产品包装】生成一张包装展示图：突出包装结构、材质、印刷细节与品牌感，整体干净高级，像提案中的展示页 hero visual，适合后续延展到详情页和品牌手册。',
    suggestedAspectRatios: ['4:3', '1:1'],
    defaultAspectRatio: '4:3',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'enhance',
    suggestedModes: ['design', 'branding'],
    suggestedImageModes: ['generate', 'enhance'],
  },
  {
    id: 'social-banner-campaign',
    title: '活动 Banner',
    category: 'social',
    summary: '适合社媒活动图、横幅头图和专题入口。',
    prompt: '请为【活动主题】生成一张活动 Banner：需要快速传达主题、时间感与参与氛围，画面结构清楚、主视觉突出，并预留横幅文案与按钮区位置。',
    suggestedAspectRatios: ['16:9', '21:9'],
    defaultAspectRatio: '16:9',
    recommendedResolution: '1K',
    recommendedModelVariant: 'standard',
    recommendedImageMode: 'generate',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate'],
  },
  {
    id: 'interior-before-after-upgrade',
    title: '空间改造前后对比',
    category: 'interior',
    summary: '适合用同一空间做风格升级提案。',
    prompt: '请围绕【空间照片/空间 brief】生成一张空间升级方向图：保留基本结构逻辑，但优化材质、光线、陈设和氛围，使其更高级、更完整，适合用作改造前后的方案对比。',
    suggestedAspectRatios: ['16:9', '4:3'],
    defaultAspectRatio: '16:9',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'background',
    suggestedModes: ['design'],
    suggestedImageModes: ['background', 'relight', 'enhance'],
  },
  {
    id: 'character-three-view-setup',
    title: '角色三视图设定',
    category: 'character',
    summary: '适合继续扩展为设定集或建模参考。',
    prompt: '请围绕【角色设定】生成角色三视图风格参考：重点保持角色服装、体型、发型、材质与身份感一致，便于后续扩展为正面、侧面、背面设定稿。',
    suggestedAspectRatios: ['16:9', '4:3'],
    defaultAspectRatio: '16:9',
    recommendedResolution: '2K',
    recommendedModelVariant: 'pro',
    recommendedImageMode: 'restyle',
    suggestedModes: ['design'],
    suggestedImageModes: ['generate', 'restyle'],
  },
];
