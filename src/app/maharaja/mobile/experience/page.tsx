import MaharajaMobileExperience from '@/components/MaharajaMobileExperience';
import { resolveWorkspaceByAccessCode } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

// The Wall QR carries its workspace code, so each store's customers open that store's phone Try-On.
// Without a code (Maharaja's original posters) it opens Maharaja's. A Try-On minimum is asked inside the
// flow (a photo of the bill), so every store opens the same screen.
export default async function MaharajaMobileExperiencePage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const { access } = await searchParams;
  const workspace = await resolveWorkspaceByAccessCode(access);
  return <MaharajaMobileExperience accessCode={workspace.tryOnCode} clientName={workspace.clientName} />;
}
