import type { Viewport } from 'next';
import TryFocusTvExperience from '@/components/TryFocusTvExperience';

// The shared touchscreen: a pinch must not zoom the page and leave it stuck for the next shopper.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false };

export default function MaharajaTvExperiencePage() {
  return <TryFocusTvExperience />;
}
