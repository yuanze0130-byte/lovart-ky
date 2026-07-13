import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';

const DEFAULT_BUCKET = 'video-references';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function getStorageClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase storage is not configured for reference image uploads');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getImageExtension(contentType: string) {
  switch (contentType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'jpg';
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as {
      action?: 'create' | 'sign';
      contentType?: string;
      path?: string;
    };
    const bucket = process.env.IMAGE_REFERENCE_BUCKET || process.env.VIDEO_REFERENCE_BUCKET || DEFAULT_BUCKET;
    const supabase = getStorageClient();

    if (body.action === 'sign') {
      if (!body.path || !body.path.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'Invalid reference image path' }, { status: 400 });
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(body.path, SIGNED_URL_TTL_SECONDS);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Failed to create reference image URL');
      }

      return NextResponse.json({ signedUrl: data.signedUrl });
    }

    const contentType = body.contentType?.toLowerCase() || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
    }

    const path = `${user.id}/${randomUUID()}.${getImageExtension(contentType)}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error || !data?.token) {
      throw new Error(error?.message || 'Failed to create reference image upload URL');
    }

    return NextResponse.json({
      bucket,
      path,
      token: data.token,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
