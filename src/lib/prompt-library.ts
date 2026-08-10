export type PromptLibraryCategory = '分镜设计' | '画质修复' | '产品设计' | '风格创作' | '身份设定' | '通用';

export interface PromptLibraryItem {
  id: string;
  label: string;
  category: PromptLibraryCategory;
  summary: string;
  prompt: string;
}

export const PROMPT_LIBRARY_CATEGORIES: PromptLibraryCategory[] = [
  '分镜设计',
  '画质修复',
  '产品设计',
  '风格创作',
  '身份设定',
  '通用',
];

export const PROMPT_LIBRARY_ITEMS: PromptLibraryItem[] = [
  {
    id: 'grid-default',
    label: '九宫格分镜脚本',
    category: '分镜设计',
    summary: '同一角色的 3×3 动作、表情和机位分镜。',
    prompt: '基于我上传的这张参考图，生成一张九宫格（3x3 grid）布局的分镜脚本。请严格保持角色与参考图一致（Keep character strictly consistent），但在9个格子中展示该角色不同的动作、表情和拍摄角度（如正面、侧面、背面、特写等）。要求风格高度统一，形成一张完整的角色动态表（Character Sheet）。',
  },
  {
    id: 'upscale-detail',
    label: '高清放大',
    category: '画质修复',
    summary: '忠于原图的清晰度、纹理和边缘增强。',
    prompt: 'Best quality, 8k, masterpiece, highres, ultra detailed, sharp focus, image restoration, upscale, faithful to original. Enhance resolution, recover fine texture and clean edges while strictly preserving the original subject, composition, colors and visual identity. Do not add or remove objects, text, logos or characters.',
  },
  {
    id: 'gpt-denoise-detail',
    label: 'GPT噪点消除',
    category: '画质修复',
    summary: '去除脏感、噪点、压缩痕迹并统一画面。',
    prompt: '请基于上传的图片进行整体修复与画质优化，不要重新生成画面。严格保留原图的排版、主体内容、人物/物体、动作、场景关系、构图和分镜顺序，不要改变故事内容，不要随意增删元素。重点优化以下问题：1. 去除画面脏感、灰感、噪点、颗粒感、压缩痕迹、杂乱纹理、模糊边缘和低质量伪影；2. 提升整体清晰度、细节干净度和画面通透感；3. 优化色彩，让颜色更纯净、更协调、更有层次，避免浑浊、发灰、发闷、过脏的颜色；4. 统一画面的视觉风格，包括色调、亮度、对比度、清晰度、线条质感、细节密度和整体精致度；5. 让画面看起来更干净、更高级、更适合展示，只做优化和统一，不要重构场景，不要改变角色外观，不要改变主体姿势，不要改变重要物体的位置。最终效果要求：画面干净、噪点少、边缘清晰、色彩通透、明暗自然、风格统一、观感高级。不要添加文字、logo、水印，不要多出新角色或多余元素，不要把图片改成完全不同的风格。',
  },
  {
    id: 'blur-to-hd-default',
    label: '糊图变高清',
    category: '画质修复',
    summary: '重建模糊细节，获得高规格 CG 级清晰度。',
    prompt: '100% pure CG, Unreal Engine 5 cinematic cutscene, Octane render quality, 8K ultra-detailed, ray tracing, global illumination, MetaHuman high quality digital humans, AAA game cinematic quality. 超写实CG数字人，3A游戏过场动画级人物质感，Unreal Engine 5 / MetaHuman级角色精度。恢复清晰五官、材质纹理与干净边缘，同时严格保持原人物身份、动作、构图和场景关系，不新增内容。',
  },
  {
    id: 'product-lineart-default',
    label: '产品转线稿',
    category: '产品设计',
    summary: '工业设计黑白线稿、结构细节与透视标注。',
    prompt: '智能提取目标物体的空间透视与三维轮廓，将其转化为极具机械美感的工业设计黑白概念线稿。精准勾勒复杂的空气动力学边缘、机械传动部件与装配接缝。在背景自动生成专业的流体力学辅助线、透视网格及尺寸标注排版。采用精准的马克笔触与轻微的灰阶排线表现截面体积，呈现顶级工业设计师的手绘蓝图质感。',
  },
  {
    id: 'style-replication-default',
    label: '风格复刻',
    category: '风格创作',
    summary: '复刻参考图的画风、笔触、配色与光影语言。',
    prompt: '(strictly mimic source image art style:1.5), (same visual style:1.4), (consistent art style:1.3), matching visual style. 严格复刻参考图的视觉风格、媒介质感、笔触、色彩关系、光影方式、构图节奏和细节密度，只替换用户指定的主体或内容，不改变整体艺术语言，不引入无关风格。',
  },
  {
    id: 'product-composite-default',
    label: '产品融图',
    category: '产品设计',
    summary: '把产品自然融入新环境并匹配真实光影。',
    prompt: '精准提取目标产品并无缝置入新场景。强制启用全局光照（GI）计算，完美吸收环境双光源（如冷蓝光与暖橙光）形成立体反射。真实演算玻璃材质的透光率与折射率，并在承接面上投射带有环境色彩的物理焦散阴影（Caustics），彻底消除边缘抠图感，实现电影级空间光影融合。',
  },
  {
    id: 'clutter-removal-default',
    label: '杂物消失',
    category: '产品设计',
    summary: '清理画面杂物并自然补全背景和遮挡关系。',
    prompt: '移除画面中与主体无关的杂物、污渍、线缆、包装、路人和视觉干扰。根据周围环境的透视、纹理、材质、光线和阴影自然补全被遮挡区域。严格保留主体、主要构图、相机视角和场景结构，不改变关键物体位置，不留下涂抹痕迹、重复纹理或不自然边缘。',
  },
  {
    id: 'product-retouch-default',
    label: '精修产品',
    category: '产品设计',
    summary: '纯白背景、材质重塑与电商级商业精修。',
    prompt: '将主体置于纯白无缝背景中，利用3D渲染级光影重塑其初始材质（如高级皮革的哑光纹理、塑料组件的镜面反光）。一键抹除所有物理磨损、泥土污渍与岁月痕迹，恢复至全新出厂状态。强化立体光感与阴影过渡，提升整体商业精致度，直出符合顶配电商主图的标准图像。',
  },
  {
    id: 'moodboard-default',
    label: '情绪版',
    category: '风格创作',
    summary: '8 区块非对称情绪板，统一色彩与叙事氛围。',
    prompt: '创建一张高密度视觉情绪版（8-panel asymmetrical grid layout）。以故事世界、主人公、核心隐喻、色板、材质、运动、关键道具和自由艺术诠释八个独立区块组织画面。采用高端杂志编辑式排版、干净细边框和统一调色，所有区块共享一致的光照与色彩逻辑。不要做随机拼贴，不要重叠画面，不要添加水印或无关 UI。',
  },
  {
    id: 'storyboard-default',
    label: '分镜版',
    category: '分镜设计',
    summary: '严格 3×3 分镜矩阵，适合后续切片。',
    prompt: '你是一位资深电影分镜师。根据参考角色和场景创建精确的 3×3 分镜矩阵，共 9 个清晰独立画格。必须严格保持角色身份、服装、道具、场景结构和视觉风格一致；每格使用不同机位或景别，包括建立镜头、正面、侧面、背面、动作、中景和特写。画格必须等距对齐，以细实线完整分隔，便于后续切片。不要拼贴、重叠、随机尺寸、文字、水印或 UI 元素。',
  },
  {
    id: 'character-sheet-default',
    label: '角色板',
    category: '身份设定',
    summary: '角色全身、多视图、服装拆解和道具资料板。',
    prompt: '(strictly mimic source image art style:1.5), (same visual style:1.4), score_9, score_8_up, masterpiece, best quality, (character sheet:1.4), (reference sheet:1.3), (consistent art style:1.3). Multiple views, full body central figure, clean background, text labels with arrows, character profile area, clothing breakdown, footwear focus, inventory knolling, personal accessories and expression panels. 严格保持角色身份、脸部、体型、发型、服装和配色一致。',
  },
  {
    id: 'cinematic-character-identity-board-default',
    label: '电影级角色身份板',
    category: '身份设定',
    summary: '电影级角色主视觉、表情、服装、材质和身份信息。',
    prompt: '创建一张艺术性的 16:9 电影级角色身份板。使用中性柔和的米白或暖灰美术画册版面，以一个大型角色英雄肖像作为视觉锚点，辅以全身正面、侧面、背面、表情特写、服装结构、关键道具和材质细节研究。布局不对称、优雅，使用大片留白和不同画幅比例，各区域保持清晰分隔。所有视图严格锁定同一角色身份、脸部、体型、服装、发型、材质和配色。加入简约的角色 ID 信息块和少量手写式标注箭头；整体像高端动画工作室的角色艺术设定集，电影感、干净、富有表现力、适用于制作。',
  },
  {
    id: 'cinematic-scene-identity-board-default',
    label: '电影级场景身份板',
    category: '身份设定',
    summary: '多机位空间研究、材质、光线和场景身份锁定。',
    prompt: '创建一张艺术性的 16:9 场景身份板。以参考图像为空间主体，使用中性柔和的米白或暖灰美术画册版面。不要做标准场景参考表或分镜表；创建电影般的空间身份板，像高端动画工作室的场景美术研究与艺术设定集。布局应不对称、优雅且视觉上令人难忘，使用大片留白、多样化画幅比例和有意的不平衡，避免网格、目录式排布和等距小图阵列。放置一个大型英雄建立镜头作为视觉锚点，围绕它排列高空俯视、反打、低角度、过肩、侧拍纵深、人视点中景、关键区域和局部材质特写。所有视角严格保持相同建筑结构、材质、光线方向、色调、地标道具、时代设定和空气氛围。包含小型平面动线区、光线氛围研究区和细节研究区，加入简约场景 ID 块及少量手写标签。最终画面应简约、电影感、高端、干净、富有表现力并适用于制作。',
  },
  {
    id: 'canvas-default',
    label: '画板提示词',
    category: '通用',
    summary: '综合当前连线素材，形成统一的生成说明。',
    prompt: '综合当前画板中所有已连接的文本提示词与参考图像，识别共同主体、场景、风格、色彩、构图、材质和叙事目标。严格保留参考素材中的身份与关键视觉特征，解决互相冲突的描述，生成一张构图完整、风格统一、细节清晰的高质量图像。不要添加与画板无关的人物、文字、logo、水印或多余物体。',
  },
];

export function getPromptLibraryItem(id: string) {
  return PROMPT_LIBRARY_ITEMS.find((item) => item.id === id);
}
