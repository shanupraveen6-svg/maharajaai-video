/**
 * TryFocus keeps what it makes for one hour: Try-On looks, AI Video portraits and videos, and Live Mirror
 * videos. Scanning the same QR again within that hour shows them. A video sent to Go Live is kept for one
 * day so it can play on the Go Live screen; then it is deleted too.
 */
export const RESULT_LIFETIME_MS = 60 * 60 * 1000;
export const GO_LIVE_LIFETIME_MS = 24 * 60 * 60 * 1000;

export const resultExpiresAtMs = () => Date.now() + RESULT_LIFETIME_MS;
export const resultExpiresAtIso = () => new Date(resultExpiresAtMs()).toISOString();
