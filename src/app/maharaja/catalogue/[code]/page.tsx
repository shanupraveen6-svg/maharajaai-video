'use client';

import { useParams } from 'next/navigation';
import GiftVideoExperience from '@/components/GiftVideoExperience';

/** The AI Video QR from the TV opens here on the customer's phone. */
export default function MaharajaCatalogueGiftPage() {
  const params = useParams<{ code: string }>();
  return <GiftVideoExperience accessCode={params.code || ''} />;
}
