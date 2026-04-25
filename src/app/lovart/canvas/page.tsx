'use client';

import dynamic from 'next/dynamic';

const CanvasPageClient = dynamic(() => import('./CanvasPageClient'), { ssr: false });

export default function LovartCanvasPage() {
  return <CanvasPageClient />;
}
