export const VIDEO_ASPECT_RATIOS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2', '2:3'] as const;

export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];
export type VideoAudioMode = 'none' | 'auto' | 'custom';
export type VideoQualityMode = 'std' | 'pro';

export interface VideoModelDefinition {
  id: string;
  apiModel?: string;
  label: string;
  provider: 'Sora' | 'Google' | 'Grok' | 'MiniMax' | 'Omini' | 'Wan' | 'Seedance' | 'Kling' | 'Vidu' | 'Midjourney';
  hint: string;
  ratios: readonly VideoAspectRatio[];
  durations: readonly number[];
  resolutions?: readonly string[];
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
  supportsStartEndFrames?: boolean;
  supportsHd?: boolean;
  hdDurations?: readonly number[];
  supportsAudioMode?: boolean;
  supportsGenerateAudio?: boolean;
  supportsMultiShot?: boolean;
  supportsCameraFixed?: boolean;
  qualityModes?: readonly VideoQualityMode[];
}

const COMMON_RATIOS = VIDEO_ASPECT_RATIOS;
const LANDSCAPE_PORTRAIT = ['16:9', '9:16'] as const;
const KLING_RATIOS = ['1:1', '16:9', '9:16'] as const;
const FIVE_TEN = [5, 10] as const;
const FOUR_TO_FIFTEEN = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

function model(definition: VideoModelDefinition) {
  return definition;
}

export const VIDEO_MODELS = [
  model({ id: 'sora-2', label: 'Sora 2', provider: 'Sora', hint: '文生视频与参考图视频', ratios: COMMON_RATIOS, durations: [4, 5, 8, 10, 12, 15], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'sora-2-pro', label: 'Sora 2 Pro', provider: 'Sora', hint: '高质量 Sora 视频', ratios: COMMON_RATIOS, durations: [4, 5, 8, 10, 12, 15], supportsReferenceImages: true, maxReferenceImages: 1, supportsHd: true, hdDurations: [10, 15] }),
  model({ id: 'sora-2-fal', label: 'Sora 2 - Fal', provider: 'Sora', hint: 'Fal 通道', ratios: LANDSCAPE_PORTRAIT, durations: [4, 8, 12], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'sora-2-pro-fal', label: 'Sora 2 Pro - Fal', provider: 'Sora', hint: 'Fal 高质量通道', ratios: LANDSCAPE_PORTRAIT, durations: [4, 8, 12], supportsReferenceImages: true, maxReferenceImages: 1, supportsHd: true }),
  model({ id: 'google-veo3.1', apiModel: 'veo3.1', label: 'Veo 3.1', provider: 'Google', hint: '音画同步与首尾帧', ratios: COMMON_RATIOS, durations: [8], resolutions: ['720p', '1080p', '4K'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-pro', apiModel: 'veo3.1-pro', label: 'Veo 3.1 Pro', provider: 'Google', hint: '高质量音画同步', ratios: COMMON_RATIOS, durations: [8], resolutions: ['720p', '1080p', '4K'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-fast', apiModel: 'veo3.1-fast', label: 'Veo 3.1 Fast', provider: 'Google', hint: '快速音画同步', ratios: COMMON_RATIOS, durations: [8], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-lite', apiModel: 'veo3.1-lite', label: 'Veo 3.1 Lite', provider: 'Google', hint: '轻量快速生成', ratios: COMMON_RATIOS, durations: [8], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-fal', label: 'Veo 3.1 - Fal', provider: 'Google', hint: 'Fal 通道', ratios: LANDSCAPE_PORTRAIT, durations: [4, 6, 8], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-pro-fal', label: 'Veo 3.1 Pro - Fal', provider: 'Google', hint: 'Fal 高质量通道', ratios: LANDSCAPE_PORTRAIT, durations: [4, 6, 8], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-fast-fal', label: 'Veo 3.1 Fast - Fal', provider: 'Google', hint: 'Fal 快速通道', ratios: LANDSCAPE_PORTRAIT, durations: [4, 6, 8], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'google-veo3.1-lite-fal', label: 'Veo 3.1 Lite - Fal', provider: 'Google', hint: 'Fal 轻量通道', ratios: LANDSCAPE_PORTRAIT, durations: [4, 6, 8], resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 3, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'grok-video-3', label: 'Grok3 Video', provider: 'Grok', hint: '长时段图生视频', ratios: COMMON_RATIOS, durations: Array.from({ length: 25 }, (_, index) => index + 6), resolutions: ['480p', '720p'], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'grok-3-fal', label: 'Grok3 Video - Fal', provider: 'Grok', hint: 'Fal 通道', ratios: LANDSCAPE_PORTRAIT, durations: [6, 10], resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'MiniMax-Hailuo-2.3', label: 'Hailuo 2.3', provider: 'MiniMax', hint: '高质量首尾帧视频', ratios: COMMON_RATIOS, durations: [6, 10], resolutions: ['768p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true }),
  model({ id: 'MiniMax-Hailuo-2.3-Fast', label: 'Hailuo 2.3-Fast', provider: 'MiniMax', hint: '快速首尾帧视频', ratios: COMMON_RATIOS, durations: [6, 10], resolutions: ['768p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true }),
  model({ id: 'MiniMax-Hailuo-02', label: 'Hailuo 2.0', provider: 'MiniMax', hint: '稳定首尾帧视频', ratios: COMMON_RATIOS, durations: [6, 10], resolutions: ['768p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true }),
  model({ id: 'omini-flash-10s', label: 'Omini', provider: 'Omini', hint: '10 秒参考视频', ratios: COMMON_RATIOS, durations: [10], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'wan2.6-i2v', label: 'Wan 2.6', provider: 'Wan', hint: '图生视频、音频与多镜头', ratios: COMMON_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsAudioMode: true, supportsMultiShot: true }),
  model({ id: 'wan-2.6-official', label: 'Wan 2.6 官', provider: 'Wan', hint: '官方 Wan 2.6', ratios: COMMON_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsAudioMode: true, supportsMultiShot: true }),
  model({ id: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 pro 官', provider: 'Seedance', hint: '官方高质量视频', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsGenerateAudio: true, supportsCameraFixed: true }),
  model({ id: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 pro 官', provider: 'Seedance', hint: '官方标准视频', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsCameraFixed: true }),
  model({ id: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 pro fast 官', provider: 'Seedance', hint: '官方快速视频', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsCameraFixed: true }),
  model({ id: 'jimeng-cli-seedance1.5-pro', label: 'Seedance 1.5 pro API', provider: 'Seedance', hint: 'API 高质量视频', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'jimeng-cli-seedance1.0', label: 'Seedance 1.0 pro API', provider: 'Seedance', hint: 'API 标准视频', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true }),
  model({ id: 'jimeng-cli-seedance1.0-fast', label: 'Seedance 1.0 pro fast API', provider: 'Seedance', hint: 'API 快速视频', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true }),
  model({ id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0 官', provider: 'Seedance', hint: '官方 Seedance 2.0', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsGenerateAudio: true, supportsCameraFixed: true }),
  model({ id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast 官', provider: 'Seedance', hint: '官方快速 2.0', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsGenerateAudio: true, supportsCameraFixed: true }),
  model({ id: 'jimeng-cli-seedance2.0', label: 'Seedance 2.0 API', provider: 'Seedance', hint: 'API Seedance 2.0', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'jimeng-cli-seedance2.0fast', label: 'Seedance 2.0 Fast API', provider: 'Seedance', hint: 'API 快速 2.0', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'jimeng-cli-seedance2.0-mini', label: 'Seedance 2.0 Mini API', provider: 'Seedance', hint: 'API 轻量 2.0', ratios: COMMON_RATIOS, durations: FOUR_TO_FIFTEEN, resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsStartEndFrames: true }),
  model({ id: 'kling-o1', label: 'Kling O1', provider: 'Kling', hint: '可灵统一视频模型', ratios: KLING_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 4, supportsStartEndFrames: true }),
  model({ id: 'kling-v3-omni', apiModel: 'kling-video-v3-omni', label: 'Kling 3.0 Omni', provider: 'Kling', hint: '多模态参考与音画生成', ratios: KLING_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 4, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'kling-video-v2-5-turbo', label: 'Kling v2.5 Turbo', provider: 'Kling', hint: '快速图生视频', ratios: KLING_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, qualityModes: ['std', 'pro'] }),
  model({ id: 'kling-video-v2-6', label: 'Kling v2.6', provider: 'Kling', hint: '音画同步视频', ratios: KLING_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsGenerateAudio: true }),
  model({ id: 'kling-video-v3', label: 'Kling 3.0', provider: 'Kling', hint: '新一代可灵视频', ratios: KLING_RATIOS, durations: [3, 5, 10, 15], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 4, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'kling-video-v2-5-turbo-fal', label: 'Kling v2.5 Turbo - Fal', provider: 'Kling', hint: 'Fal 快速通道', ratios: KLING_RATIOS, durations: FIVE_TEN, resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'kling-video-v2-6-fal', label: 'Kling v2.6 - Fal', provider: 'Kling', hint: 'Fal 音画通道', ratios: KLING_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1, supportsGenerateAudio: true }),
  model({ id: 'kling-v3-fal', label: 'Kling 3.0 - Fal', provider: 'Kling', hint: 'Fal 新一代通道', ratios: KLING_RATIOS, durations: [3, 5, 10, 15], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 4, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'vidu-q2', apiModel: 'viduq2', label: 'Vidu Q2', provider: 'Vidu', hint: '首尾帧与参考生视频', ratios: COMMON_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 7, supportsStartEndFrames: true }),
  model({ id: 'vidu-q2-turbo', apiModel: 'viduq2-turbo', label: 'Vidu Q2 Turbo', provider: 'Vidu', hint: '快速首尾帧视频', ratios: COMMON_RATIOS, durations: FIVE_TEN, resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 7, supportsStartEndFrames: true }),
  model({ id: 'vidu-2.0', apiModel: 'vidu2.0', label: 'Vidu 2.0', provider: 'Vidu', hint: '稳定图生视频', ratios: COMMON_RATIOS, durations: [4, 8], resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 1 }),
  model({ id: 'vidu-q3-pro', apiModel: 'viduq3-pro', label: 'Vidu Q3 Pro', provider: 'Vidu', hint: '高质量音画视频', ratios: COMMON_RATIOS, durations: FIVE_TEN, resolutions: ['720p', '1080p'], supportsReferenceImages: true, maxReferenceImages: 7, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'vidu-q3-turbo', apiModel: 'viduq3-turbo', label: 'Vidu Q3 Turbo', provider: 'Vidu', hint: '快速音画视频', ratios: COMMON_RATIOS, durations: FIVE_TEN, resolutions: ['720p'], supportsReferenceImages: true, maxReferenceImages: 7, supportsStartEndFrames: true, supportsGenerateAudio: true }),
  model({ id: 'mj-video', label: 'MJ Video', provider: 'Midjourney', hint: 'Midjourney 图生视频', ratios: COMMON_RATIOS, durations: [5, 10], supportsReferenceImages: true, maxReferenceImages: 1 }),
] as const satisfies readonly VideoModelDefinition[];

export type VideoModelId = (typeof VIDEO_MODELS)[number]['id'];

const VIDEO_MODEL_MAP = new Map<string, VideoModelDefinition>(VIDEO_MODELS.map((entry) => [entry.id, entry]));

export const DEFAULT_VIDEO_MODEL_ID: VideoModelId = 'doubao-seedance-2-0-260128';

export function getVideoModelDefinition(modelId?: string | null): VideoModelDefinition {
  return VIDEO_MODEL_MAP.get(modelId || '') || VIDEO_MODEL_MAP.get(DEFAULT_VIDEO_MODEL_ID)!;
}

export interface VideoGenerationConfig {
  modelId: string;
  aspectRatio: VideoAspectRatio;
  duration: number;
  resolution?: string;
  hd: boolean;
  useStartEndFrames: boolean;
  audioMode: VideoAudioMode;
  generateAudio: boolean;
  multiShot: boolean;
  cameraFixed: boolean;
  qualityMode: VideoQualityMode;
}

export function normalizeVideoGenerationConfig(input: Partial<VideoGenerationConfig>): VideoGenerationConfig {
  const definition = getVideoModelDefinition(input.modelId);
  const aspectRatio = definition.ratios.includes(input.aspectRatio as VideoAspectRatio)
    ? input.aspectRatio as VideoAspectRatio
    : definition.ratios.includes('16:9') ? '16:9' : definition.ratios[0];
  const duration = definition.durations.includes(Number(input.duration))
    ? Number(input.duration)
    : definition.durations[0];
  const resolution = definition.resolutions?.includes(input.resolution || '')
    ? input.resolution
    : definition.resolutions?.[0];

  return {
    modelId: definition.id,
    aspectRatio,
    duration,
    resolution,
    hd: Boolean(definition.supportsHd && input.hd && (!definition.hdDurations || definition.hdDurations.includes(duration))),
    useStartEndFrames: Boolean(definition.supportsStartEndFrames && input.useStartEndFrames),
    audioMode: definition.supportsAudioMode && ['none', 'auto', 'custom'].includes(input.audioMode || '') ? input.audioMode! : 'none',
    generateAudio: Boolean(definition.supportsGenerateAudio && input.generateAudio),
    multiShot: Boolean(definition.supportsMultiShot && input.multiShot),
    cameraFixed: Boolean(definition.supportsCameraFixed && input.cameraFixed),
    qualityMode: definition.qualityModes?.includes(input.qualityMode as VideoQualityMode)
      ? input.qualityMode as VideoQualityMode
      : 'pro',
  };
}
