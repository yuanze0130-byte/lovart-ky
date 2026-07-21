import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase';

const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 360;
const THUMBNAIL_QUALITY = 0.72;
const MAX_INLINE_THUMBNAIL_LENGTH = 160_000;

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    }, 'image/webp', THUMBNAIL_QUALITY);
  });
}

export async function createProjectThumbnail(source: string): Promise<string | null> {
  if (!source) return null;
  if (!source.startsWith('data:image/')) return source;
  if (source.length <= MAX_INLINE_THUMBNAIL_LENGTH) return source;

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth;
      const sourceHeight = image.naturalHeight;
      if (!sourceWidth || !sourceHeight) {
        resolve(null);
        return;
      }

      const sourceAspect = sourceWidth / sourceHeight;
      const targetAspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
      let sourceX = 0;
      let sourceY = 0;
      let cropWidth = sourceWidth;
      let cropHeight = sourceHeight;

      if (sourceAspect > targetAspect) {
        cropWidth = sourceHeight * targetAspect;
        sourceX = (sourceWidth - cropWidth) / 2;
      } else if (sourceAspect < targetAspect) {
        cropHeight = sourceWidth / targetAspect;
        sourceY = (sourceHeight - cropHeight) / 2;
      }

      const canvas = document.createElement('canvas');
      canvas.width = THUMBNAIL_WIDTH;
      canvas.height = THUMBNAIL_HEIGHT;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        resolve(null);
        return;
      }

      context.drawImage(
        image,
        sourceX,
        sourceY,
        cropWidth,
        cropHeight,
        0,
        0,
        THUMBNAIL_WIDTH,
        THUMBNAIL_HEIGHT
      );
      void canvasToDataUrl(canvas).then(resolve);
    };

    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export async function persistProjectThumbnail(
  supabase: SupabaseClient<Database>,
  projectId: string,
  source: string
): Promise<string | null> {
  const thumbnail = await createProjectThumbnail(source);
  if (!thumbnail) return null;

  const { error } = await supabase
    .from('projects')
    .update({ thumbnail })
    .eq('id', projectId);

  if (error) throw error;
  return thumbnail;
}
