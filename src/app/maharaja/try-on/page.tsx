'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MaharajaExperience from '@/components/MaharajaExperience';

function TryOnExperience() {
  const searchParams = useSearchParams();
  return <MaharajaExperience service="try-on" accessCode={searchParams.get('access') || ''} />;
}

export default function MaharajaTryOnPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#F5F2EA]" />}><TryOnExperience /></Suspense>;
}
