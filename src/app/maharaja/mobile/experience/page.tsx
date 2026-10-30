import MaharajaMobileExperience from '@/components/MaharajaMobileExperience';
import MaharajaExperience from '@/components/MaharajaExperience';
import { resolveWorkspaceByAccessCode } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

// The try-on QR carries its workspace code, so each client's customers open that client's experience.
// Without a code (Maharaja's original posters) it opens Maharaja's.
export default async function MaharajaMobileExperiencePage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const { access } = await searchParams;
  const workspace = await resolveWorkspaceByAccessCode(access);
  if (workspace.minPurchaseTryOnDisabled === false) return <MaharajaExperience service="try-on" accessCode={workspace.tryOnCode} />;
  return <MaharajaMobileExperience accessCode={workspace.tryOnCode} clientName={workspace.clientName} videoEntryUrl={`/maharaja/video-poster?code=${encodeURIComponent(workspace.openVideoCode)}`} />;
}
