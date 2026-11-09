/**
 * The customer surface a lead (a WhatsApp number given before a download) came from. Kept separate from
 * `maharaja/leads.ts`, which is server-only (it imports firebase-admin), so the client workspace's
 * Customers tab can import this one name map without pulling server code into the browser bundle.
 */
export type LeadSource = 'try-on' | 'ai-video' | 'live-mirror' | 'tv-looks';

export const LEAD_SOURCES: LeadSource[] = ['try-on', 'ai-video', 'live-mirror', 'tv-looks'];

/** What the customer used, in the product's own words (TV looks are Try-On). */
export const LEAD_SOURCE_NAMES: Record<LeadSource, string> = {
  'try-on': 'Try-On',
  'tv-looks': 'Try-On',
  'ai-video': 'AI Video',
  'live-mirror': 'Live Mirror',
};
