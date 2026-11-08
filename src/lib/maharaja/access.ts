/**
 * How a workspace's devices and modules depend on each other. One set of rules is used by the APIs,
 * TryFocus admin, the client workspace and the TV, so switching one thing off switches off everything
 * that needs it:
 *  - A store books a platform: the TV, the tablet, or the phone on its own. The customer's phone comes
 *    with the TV and the tablet (Wall QR Try-On, the photo upload QR and the AI Video on the phone).
 *  - The platform decides the modules, and every module of a platform comes with it:
 *      TV     = Try-On + AI Video + Live Mirror
 *      Tablet = Try-On + AI Video
 *      Phone  = Try-On only (no AI Video, no Live Mirror)
 *  - AI Video is made from the store collection only (no own-outfit video), on the TV or the tablet;
 *    the biller's gift QR picks the purchased piece from the same collection.
 *  - Go Live plays every AI Video on the store's own LED or wall screen (a browser link), whenever AI
 *    Video runs and TryFocus has not switched the Go Live player off.
 *  - Staff Try-On on the counter runs only with the tablet; without it the counter page is the biller's
 *    AI Video gift QR only.
 * A module switched off in `modules` stays off (TryFocus can pause one), but a module is never on where
 * the platform does not include it.
 */
export type AccessDevices = { tv: boolean; tablet: boolean; mobile: boolean; led: boolean };
export type AccessModules = { image: boolean; live: boolean; video: boolean };
export type AccessModule = keyof AccessModules;

export type WorkspaceAccess = {
  modules: AccessModules;
  /** Why a purchased module is not running (only set when it was switched on but a device is missing). */
  blockedBy: Partial<Record<AccessModule, string>>;
  goLive: boolean;
  /** AI Video from the store collection on the TV or the tablet. */
  catalogueVideo: boolean;
  /** AI Video of an outfit photographed by the customer. Not offered: AI Video uses the store collection. */
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

  const video = m.video && (d.tv || d.tablet);
  if (m.video && !video) blockedBy.video = 'Needs the TV or the tablet (the Phone platform has Try-On only)';
  const goLive = video && d.led;
  if (video && !d.led) blockedBy.video = 'Go Live player is off; AI Videos can be downloaded only';

  return {
    modules: { image, live, video },
    blockedBy,
    goLive,
    catalogueVideo: video,
    ownGarmentVideo: false,
    counterTryOn: image && d.tablet,
  };
}

/**
 * The screens a store books. The phone is in all of them, and `led` is the Go Live player on the store's
 * own LED or wall screen. "tv-tablet" is a TV store that also runs the counter tablet; it is priced as TV.
 */
export type PackageId = 'tv' | 'tablet' | 'tv-tablet' | 'phone';

export const PACKAGES: Record<PackageId, { label: string; devices: AccessDevices }> = {
  tv: { label: 'TV', devices: { tv: true, tablet: false, mobile: true, led: true } },
  tablet: { label: 'Tablet', devices: { tv: false, tablet: true, mobile: true, led: true } },
  'tv-tablet': { label: 'TV and tablet', devices: { tv: true, tablet: true, mobile: true, led: true } },
  phone: { label: 'Phone', devices: { tv: false, tablet: false, mobile: true, led: false } },
};

/** The platforms offered to new stores. */
export const OFFERED_PACKAGES: PackageId[] = ['tv', 'tablet'];

export function packageOf(devices?: Partial<AccessDevices> | null): PackageId {
  const d = { ...ALL_ON_DEVICES, ...(devices || {}) };
  if (d.tv) return d.tablet ? 'tv-tablet' : 'tv';
  return d.tablet ? 'tablet' : 'phone';
}

/** What the store booked, in the words used on the pricing page. */
export function packageLabel(devices?: Partial<AccessDevices> | null) {
  return PACKAGES[packageOf(devices)].label;
}

/** The modules that come with a package: switching the platform switches these on or off together. */
export function modulesForPackage(id: PackageId): AccessModules {
  const devices = PACKAGES[id].devices;
  return { image: true, video: devices.tv || devices.tablet, live: devices.tv };
}
