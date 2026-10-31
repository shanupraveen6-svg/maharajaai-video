/**
 * How a workspace's devices and modules depend on each other. One set of rules is used by the APIs,
 * TryFocus admin, the client workspace and the TV, so switching one thing off switches off everything
 * that needs it:
 *  - Live Mirror runs only on the TV.
 *  - AI Video needs the Go Live player (where customer videos play) and Customer Mobile (every video is
 *    finished, downloaded and shared on the customer's phone).
 *  - Catalogue AI Video starts on the TV; own-garment AI Video starts at the counter or from a phone poster.
 *  - The Go Live player plays only AI videos, so it is off when AI Video is off.
 *  - Image Try-On needs a TV, counter or phone.
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
};

const ALL_ON_DEVICES: AccessDevices = { tv: true, tablet: true, mobile: true, led: true };
const ALL_ON_MODULES: AccessModules = { image: true, live: true, video: true };

export function resolveAccess(devices?: Partial<AccessDevices> | null, modules?: Partial<AccessModules> | null): WorkspaceAccess {
  const d = { ...ALL_ON_DEVICES, ...(devices || {}) };
  const m = { ...ALL_ON_MODULES, ...(modules || {}) };
  const anyScreen = d.tv || d.tablet || d.mobile;
  const blockedBy: WorkspaceAccess['blockedBy'] = {};

  const image = m.image && anyScreen;
  if (m.image && !image) blockedBy.image = 'Needs a TV, counter tablet or customer mobile';

  const live = m.live && d.tv;
  if (m.live && !live) blockedBy.live = 'Needs the TV (Live Mirror runs only on the TV)';

  const video = m.video && d.led && d.mobile;
  if (m.video && !video) {
    blockedBy.video = `Needs ${[!d.led && 'the Go Live player', !d.mobile && 'Customer Mobile'].filter(Boolean).join(' and ')}`;
  }

  return {
    modules: { image, live, video },
    blockedBy,
    goLive: video,
    catalogueVideo: video && d.tv,
    ownGarmentVideo: video,
  };
}
