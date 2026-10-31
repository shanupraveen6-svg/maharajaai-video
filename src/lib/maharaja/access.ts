/**
 * How a workspace's devices and modules depend on each other. One set of rules is used by the APIs,
 * TryFocus admin, the client workspace and the TV, so switching one thing off switches off everything
 * that needs it:
 *  - Customer Mobile is always included, so Image Try-On and own-garment AI Video (biller QR from the
 *    tablet or the biller's phone) run whenever the module has credits.
 *  - Live Mirror runs only on the TV.
 *  - Catalogue AI Video and the Go Live TV link are TV features: turning Go Live off stops only
 *    catalogue AI Video; own-garment AI Video keeps working.
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
  const d = { ...ALL_ON_DEVICES, ...(devices || {}), mobile: true };
  const m = { ...ALL_ON_MODULES, ...(modules || {}) };
  const blockedBy: WorkspaceAccess['blockedBy'] = {};

  const image = m.image;

  const live = m.live && d.tv;
  if (m.live && !live) blockedBy.live = 'Needs the TV (Live Mirror runs only on the TV)';

  const video = m.video;
  const goLive = video && d.tv && d.led;
  if (video && !goLive) blockedBy.video = `Catalogue AI Video and Go Live are off (${!d.tv ? 'needs the TV' : 'Go Live is switched off'}); own-garment AI Video runs`;

  return {
    modules: { image, live, video },
    blockedBy,
    goLive,
    catalogueVideo: goLive,
    ownGarmentVideo: video,
  };
}
