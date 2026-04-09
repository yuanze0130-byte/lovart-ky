'use client';

import dynamic from 'next/dynamic';

const UserPageClient = dynamic(() => import('./UserPageClient'), { ssr: false });

export default function UserPage() {
  return <UserPageClient />;
}
