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
  'செந்தில்',      // Senthil
  'விக்னேஷ்',     // Vignesh
  'தினேஷ்',       // Dinesh
  'பிரவீன்',      // Praveen
  'அருண்',        // Arun
  'சரவணன்',      // Saravanan
] as const;

export const TAMIL_LOCALITIES = [
  'தஞ்சாவூர்',    // Thanjavur
  'கும்பகோணம்',   // Kumbakonam
  'திருச்சி',     // Trichy
  'மன்னார்குடி',   // Mannargudi
  'பட்டுக்கோட்டை', // Pattukkottai
  'மயிலாடுதுறை',  // Mayiladuthurai
  'திருவாரூர்',    // Tiruvarur
  'நாகப்பட்டினம்', // Nagapattinam
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
