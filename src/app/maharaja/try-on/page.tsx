import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The old Try-On page. Printed links still land here: they open the phone Try-On of the same store.
export default async function MaharajaTryOnPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const { access } = await searchParams;
  redirect(access ? `/maharaja/mobile/experience?access=${encodeURIComponent(access)}` : '/maharaja/mobile/experience');
}
