import { getImageModelDefinition, type ImageModelId } from '@/lib/image-models';
import { resolveImageUpstreamModel, type ImageResolution } from '@/lib/image-model-routing';
import { quoteImageCredits } from '@/lib/image-pricing';
import { quoteVideoCredits } from '@/lib/video-pricing';
import { normalizeVideoGenerationConfig, type VideoGenerationConfig, type VideoAspectRatio } from '@/lib/video-models';

export type ExpectedGenerationPrice = { credits: number; priceVersion: string; contract?: string };

export function videoRatioFromSize(size?: string): VideoAspectRatio {
  const ratios: Record<string, VideoAspectRatio> = {
    '1280x720':'16:9','1792x1024':'16:9','720x1280':'9:16','1024x1792':'9:16',
    '1024x1024':'1:1','1024x1280':'4:5','1024x768':'4:3','768x1024':'3:4',
    '1536x640':'21:9','1152x768':'3:2','768x1152':'2:3',
  };
  return ratios[size || ''] || '16:9';
}

export function imageGenerationContract(modelId: ImageModelId, resolution: ImageResolution, referenceCount = 0) {
  const definition = getImageModelDefinition(modelId);
  const upstreamModel = resolveImageUpstreamModel({modelId, resolution});
  const quote = quoteImageCredits({modelId,upstreamModel,resolution,referenceCount});
  const contract = JSON.stringify(['image-v1',modelId,upstreamModel,resolution,definition.transport,quote.group,quote.costUnits,quote.credits,quote.priceVersion]);
  return {definition,quote,expectedPrice:{credits:quote.credits,priceVersion:quote.priceVersion,contract}};
}

export function videoGenerationContract(input: Partial<VideoGenerationConfig>) {
  const config = normalizeVideoGenerationConfig(input);
  const quote = quoteVideoCredits(config);
  const contract = JSON.stringify(['video-v1','v2/videos/generations',quote.modelId,quote.upstreamModel,config.aspectRatio,config.duration,
    config.resolution,config.qualityMode,config.hd,config.useStartEndFrames,config.audioMode,config.generateAudio,
    config.multiShot,config.cameraFixed,quote.group,quote.costMicros,quote.credits,quote.priceVersion]);
  return {config,quote,expectedPrice:{credits:quote.credits,priceVersion:quote.priceVersion,contract}};
}

export function matchesGenerationPrice(expected: ExpectedGenerationPrice | undefined, actual: ExpectedGenerationPrice) {
  // Older clients may only supply a price/version pair; all current submission
  // paths attach the route/spec contract as well. Never trust client costs.
  return expected !== null && (expected === undefined || (expected.credits === actual.credits
    && expected.priceVersion === actual.priceVersion && (expected.contract === undefined || expected.contract === actual.contract)));
}
