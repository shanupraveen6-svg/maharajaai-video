export const TAMIL_SHOWROOM_NAMES = [
  'காவியா',       // Kaviya
  'பிரியா',        // Priya
  'அனிதா',        // Anitha
  'தீபிகா',       // Deepika
  'சினேகா',       // Sneha
  'லட்சுமி',      // Lakshmi
  'ரம்யா',        // Ramya
  'நந்தினி',      // Nandhini
  'திவ்யா',       // Divya
  'ரேவதி',        // Revathi
  'சௌமியா',      // Sowmya
  'கீர்த்தனா',    // Keerthana
  'பவித்ரா',      // Pavithra
  'கார்த்திக்',    // Karthik
  'விக்னேஷ்',     // Vignesh
  'தினேஷ்',       // Dinesh
  'பிரவீன்',      // Praveen
  'அருண்',        // Arun
  'சரவணன்',      // Saravanan
] as const;

export const TAMIL_GENTS_NAMES = [
  'கார்த்திக்',
  'விக்னேஷ்',
  'தினேஷ்',
  'அருண்',
] as const;

const TV_NAME_BY_SESSION_ID: Readonly<Record<string, string>> = {
  seed_9915f017: 'கார்த்திக்',
  seed_9038ee79: 'விக்னேஷ்',
  seed_417e8421: 'தினேஷ்',
  seed_216dd83b: 'அருண்',
};

export function getAssignedTvName(sessionId: unknown): string | null {
  if (typeof sessionId !== 'string') return null;
  return TV_NAME_BY_SESSION_ID[sessionId.trim()] || null;
}

export const TAMIL_LOCALITIES = [
  'தஞ்சாவூர்',    // Thanjavur
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Returns a distinct, deterministic Tamil customer name for any video seed.
 * Ensures stored videos on Firebase Storage cycle through unique Tamil names
 * instead of repeating the same name for every video.
 */
export function getTamilCustomerName(seed: string, index = 0): string {
  const hash = hashSeed(seed || 'maharaja-guest');
  return TAMIL_SHOWROOM_NAMES[(hash + index) % TAMIL_SHOWROOM_NAMES.length];
}

/**
 * Returns a distinct, deterministic locality around Thanjavur for showroom displays.
 */
export function getTamilCustomerLocality(seed: string, index = 0): string {
  const hash = hashSeed(seed || 'maharaja-locality');
  return TAMIL_LOCALITIES[(hash + index) % TAMIL_LOCALITIES.length];
}
