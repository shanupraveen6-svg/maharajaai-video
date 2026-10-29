import { redirect } from 'next/navigation';
import MaharajaExperience from '@/components/MaharajaExperience';
import { getMaharajaWorkspace } from '@/lib/maharaja/server';

export default async function MaharajaVideoExperiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ retry?: string }>;
}) {
  const [{ code }, query, workspace] = await Promise.all([params, searchParams, getMaharajaWorkspace()]);
  // Previously printed poster QRs used this shared URL. Exchange them for
  // a private customer pass instead of reusing the poster code as a session.
  if (code === workspace.openVideoCode) {
    redirect(`/maharaja/video-poster?code=${encodeURIComponent(code)}`);
  }
  return <MaharajaExperience service="ai-video" accessCode={code} retrySessionId={query.retry || ''} />;
}
