'use client';

import { useParams } from 'next/navigation';
import MaharajaExperience from '@/components/MaharajaExperience';

export default function MaharajaVideoExperiencePage() {
  const params = useParams<{ code: string }>();
  return <MaharajaExperience service="ai-video" accessCode={params.code || ''} />;
}
