export const TAMIL_GENTS_NAMES = [
  'கார்த்திக்',    // Karthik (Karthi)
  'விக்னேஷ்',     // Vignesh
  'தினேஷ்',       // Dinesh
  'பிரவீன்',      // Praveen
  'அருண்',        // Arun
  'சரவணன்',      // Saravanan
  'சூர்யா',       // Surya
  'விஜய்',        // Vijay
] as const;

export const TAMIL_LADIES_NAMES = [
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
  'பவித்ரா',      // Pavithra
] as const;

export const TAMIL_SHOWROOM_NAMES = [
  ...TAMIL_GENTS_NAMES,
  ...TAMIL_LADIES_NAMES,
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
 * Strictly respects customer category (Gents vs Ladies) so men's videos get male names.
 */
export function getTamilCustomerName(seed: string, index = 0, category?: string): string {
  const hash = hashSeed(seed || 'maharaja-guest');
  if (category === 'men' || category === 'boy') {
    return TAMIL_GENTS_NAMES[(hash + index) % TAMIL_GENTS_NAMES.length];
  }
  if (category === 'women' || category === 'girl') {
    return TAMIL_LADIES_NAMES[(hash + index) % TAMIL_LADIES_NAMES.length];
  }
  return TAMIL_SHOWROOM_NAMES[(hash + index) % TAMIL_SHOWROOM_NAMES.length];
}

/**
 * Returns a distinct, deterministic locality around Thanjavur for showroom displays.
 */
export function getTamilCustomerLocality(seed: string, index = 0): string {
  const hash = hashSeed(seed || 'maharaja-locality');
  return TAMIL_LOCALITIES[(hash + index) % TAMIL_LOCALITIES.length];
}
