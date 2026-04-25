'use client';

import dynamic from 'next/dynamic';

const CanvasPageClient = dynamic(() => import('../lovart/canvas/CanvasPageClient'), { ssr: false });

export default function CanvasPage() {
  return <CanvasPageClient />;
}
