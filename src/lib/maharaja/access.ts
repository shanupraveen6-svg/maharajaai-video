/**
 * How a workspace's devices and modules depend on each other. One set of rules is used by the APIs,
 * TryFocus admin, the client workspace and the TV, so switching one thing off switches off everything
 * that needs it:
 *  - A store books a screen: the TV, the tablet, or both. The customer's phone comes with every booking
 *    (Wall QR Try-On and the AI Video gift QR).
 *  - Try-On is always included. AI Video and Live Mirror are add-ons.
 *  - Live Mirror runs only on the TV. AI Video from the store collection on the TV needs the TV; the AI
 *    Video gift QR works with either screen.
 *  - Go Live plays every AI Video on the store's own LED or wall screen (a browser link), whenever AI
 *    Video is on and TryFocus has not switched the Go Live player off.
 *  - Staff Try-On on the counter runs only with the tablet; without it the counter page is the biller's
 *    AI Video gift QR only.
 */
export type AccessDevices = { tv: boolean; tablet: boolean; mobile: boolean; led: boolean };
export type AccessModules = { image: boolean; live: boolean; video: boolean };
export type AccessModule = keyof AccessModules;

export type WorkspaceAccess = {
  modules: AccessModules;
  /** Why a purchased module is not running (only set when it was switched on but a device is missing). */
  blockedBy: Partial<Record<AccessModule, string>>;
  goLive: boolean;
  catalogueVideo: boolean;
  ownGarmentVideo: boolean;
  /** Staff Try-On on the counter page (needs the tablet). */
  counterTryOn: boolean;
};

const ALL_ON_DEVICES: AccessDevices = { tv: true, tablet: true, mobile: true, led: true };
const ALL_ON_MODULES: AccessModules = { image: true, live: true, video: true };

export function resolveAccess(devices?: Partial<AccessDevices> | null, modules?: Partial<AccessModules> | null): WorkspaceAccess {
  const d = { ...ALL_ON_DEVICES, ...(devices || {}), mobile: true };
  const m = { ...ALL_ON_MODULES, ...(modules || {}) };
  const blockedBy: WorkspaceAccess['blockedBy'] = {};

  const image = m.image;

  const live = m.live && d.tv;
  if (m.live && !live) blockedBy.live = 'Needs the TV (Live Mirror runs only on the TV)';

  const video = m.video;
  const goLive = video && d.led;
  if (video && !d.led) blockedBy.video = 'Go Live player is off; AI Videos can be downloaded only';

  return {
    modules: { image, live, video },
    blockedBy,
    goLive,
    catalogueVideo: video && d.tv,
    ownGarmentVideo: video,
    counterTryOn: image && d.tablet,
  };
}

/**
 * The screens a store books. The phone is in all of them, and `led` is the Go Live player on the store's
 * own LED or wall screen. "phone" is kept only for older workspaces booked before every store had a screen.
 */
export type PackageId = 'tv' | 'tablet' | 'tv-tablet' | 'phone';

export const PACKAGES: Record<PackageId, { label: string; devices: AccessDevices }> = {
  tv: { label: 'TV', devices: { tv: true, tablet: false, mobile: true, led: true } },
  tablet: { label: 'Tablet', devices: { tv: false, tablet: true, mobile: true, led: true } },
  'tv-tablet': { label: 'TV and tablet', devices: { tv: true, tablet: true, mobile: true, led: true } },
  phone: { label: 'Phone only', devices: { tv: false, tablet: false, mobile: true, led: true } },
};

/** The screens offered to new stores. */
export const OFFERED_PACKAGES: PackageId[] = ['tv', 'tablet', 'tv-tablet'];

export function packageOf(devices?: Partial<AccessDevices> | null): PackageId {
  const d = { ...ALL_ON_DEVICES, ...(devices || {}) };
  if (d.tv) return d.tablet ? 'tv-tablet' : 'tv';
  return d.tablet ? 'tablet' : 'phone';
}

/** What the store booked, in the words used on the pricing page. */
export function packageLabel(devices?: Partial<AccessDevices> | null) {
  return PACKAGES[packageOf(devices)].label;
}

/**
 * The two credit packages. Each covers all three experiences; a store uses only the ones it took
 * (pay as you go), so a TV store with Try-On only uses just the image credits.
 */
export const CREDIT_PACKAGES = {
  one: { label: 'Package 1', image: 3000, video: 1000, live: 1000 },
  two: { label: 'Package 2', image: 5000, video: 2000, live: 2000 },
} as const;
export type CreditPackageId = keyof typeof CREDIT_PACKAGES;
