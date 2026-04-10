'use client';

import dynamic from 'next/dynamic';

const LovartDashboardClient = dynamic(() => import('./lovart/LovartDashboardClient'), { ssr: false });

export default function HomePage() {
  return <LovartDashboardClient />;
}
