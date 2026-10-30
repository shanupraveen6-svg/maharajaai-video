import MaharajaMobileExperience from '@/components/MaharajaMobileExperience';
import MaharajaExperience from '@/components/MaharajaExperience';
import { getMaharajaWorkspace } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';
export default async function MaharajaMobileExperiencePage() {
  const workspace = await getMaharajaWorkspace();
  if (workspace.minPurchaseTryOnDisabled === false) return <MaharajaExperience service="try-on" accessCode={workspace.tryOnCode} />;
  return <MaharajaMobileExperience accessCode={workspace.tryOnCode} videoEntryUrl={`/maharaja/video-poster?code=${encodeURIComponent(workspace.openVideoCode)}`} />;
}
