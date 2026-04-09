export interface ImageDimensions {
  width: number;
  height: number;
}

export interface SmartDisplaySize extends ImageDimensions {
  originalWidth: number;
  originalHeight: number;
  scale: number;
}

const MAX_DISPLAY_SIDE = 768;

export async function getImageDimensions(imageSrc: string): Promise<ImageDimensions> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error('读取图片尺寸失败'));
    image.src = imageSrc;
  });
}

export function getSmartDisplaySize(
  dimensions: ImageDimensions,
  maxDisplaySide = MAX_DISPLAY_SIDE
): SmartDisplaySize {
  const { width, height } = dimensions;
  const longestSide = Math.max(width, height, 1);
  const scale = Math.min(1, maxDisplaySide / longestSide);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    originalWidth: width,
    originalHeight: height,
    scale,
  };
}
