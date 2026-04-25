'use client';

import dynamic from 'next/dynamic';

const ProjectsPageClient = dynamic(() => import('../lovart/projects/ProjectsPageClient'), { ssr: false });

export default function ProjectsPage() {
  return <ProjectsPageClient />;
}
