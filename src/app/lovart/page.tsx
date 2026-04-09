'use client';

import dynamic from 'next/dynamic';

const LovartDashboardClient = dynamic(() => import('./LovartDashboardClient'), { ssr: false });

export default function LovartPage() {
  return <LovartDashboardClient />;
}
