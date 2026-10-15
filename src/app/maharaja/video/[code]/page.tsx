'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import MaharajaExperience from '@/components/MaharajaExperience';

export default function MaharajaVideoExperiencePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#F5F2EA]" />}><VideoExperience /></Suspense>;
}

function VideoExperience() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  return <MaharajaExperience service="ai-video" accessCode={params.code || ''} retrySessionId={searchParams.get('retry') || ''} />;
}
