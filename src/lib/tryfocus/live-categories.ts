/**
 * Live Try-On (Decart Lucy, real time) shows only the garments the store switched on for it: per garment in
 * the Image Try-On table, or a whole category with the switch above it. Ethnic wear is never offered there.
 */
export function isLiveMirrorReady(item: { eligibleForLive?: boolean }) {
  return item.eligibleForLive === true;
}
