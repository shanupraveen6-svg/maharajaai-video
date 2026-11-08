import { redirect } from 'next/navigation';
import { getMaharajaWorkspace } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

/**
 * Older AI Video links. A store's printed poster code still exchanges for a private pass; a customer's own
 * pass opens the phone AI Video, which picks up wherever that pass stopped (piece, portrait or video).
 */
export default async function MaharajaVideoExperiencePage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, workspace] = await Promise.all([params, getMaharajaWorkspace()]);
  if (code === workspace.openVideoCode) redirect(`/maharaja/video-poster?code=${encodeURIComponent(code)}`);
  redirect(`/maharaja/catalogue/${encodeURIComponent(code)}`);
}
