'use client';

import { authedFetch } from '@/lib/authed-fetch';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type UploadTicket = {
  bucket?: string;
  path?: string;
  token?: string;
  error?: string;
};

type SignedReference = {
  signedUrl?: string;
  error?: string;
};

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function isFetchableBrowserUrl(value: string) {
  const trimmed = value.trim();
  return isRemoteUrl(trimmed) || /^\/(?!\/)/.test(trimmed) || /^blob:/i.test(trimmed);
}

async function inlineImageToBlob(referenceImage: string) {
  const trimmed = referenceImage.trim();
  if (isFetchableBrowserUrl(trimmed)) {
    const response = await fetch(trimmed);
    if (!response.ok) throw new Error('Failed to read the reference image');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Reference asset is not an image');
    return blob;
  }
  const dataUrl = /^data:image\/[\w.+-]+;base64,/i.test(trimmed)
    ? trimmed
    : `data:image/jpeg;base64,${trimmed}`;
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error('Failed to read the reference image');
  }

  return response.blob();
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Reference image upload failed');
  }
  return data;
}

async function uploadInlineReference(referenceImage: string) {
  const blob = await inlineImageToBlob(referenceImage);
  const ticketResponse = await authedFetch('/api/image-reference-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', contentType: blob.type || 'image/jpeg' }),
  });
  const ticket = await readJson<UploadTicket>(ticketResponse);

  if (!ticket.bucket || !ticket.path || !ticket.token) {
    throw new Error('Reference image upload ticket is incomplete');
  }

  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Reference image upload failed: ${uploadError.message}`);
  }

  const signedResponse = await authedFetch('/api/image-reference-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sign', path: ticket.path }),
  });
  const signed = await readJson<SignedReference>(signedResponse);

  if (!signed.signedUrl) {
    throw new Error('Reference image URL was not returned');
  }

  return signed.signedUrl;
}

export async function uploadReferenceImages(referenceImages: string[]) {
  return Promise.all(
    referenceImages
      .filter(Boolean)
      .slice(0, 4)
      .map((image) => (isRemoteUrl(image) ? image : uploadInlineReference(image)))
  );
}
