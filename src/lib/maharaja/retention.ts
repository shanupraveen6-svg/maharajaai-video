/**
 * TryFocus keeps what it makes for one hour at most (a grace period to download; once downloaded it is
 * wiped within minutes): Try-On looks, AI Video portraits and videos, and Live Try-On
 * videos. Scanning the same QR again within that hour shows them. A video sent to Go Live is kept for one
 * day so it can play on the Go Live screen; then it is deleted too.
 */
export const RESULT_LIFETIME_MS = 60 * 60 * 1000;
/**
 * Testing phase (Maharaja, before the first paying client is onboarded): Go Live videos are kept, so the Go
 * Live player and the TV's idle loop keep playing the test videos. At onboarding this goes back to false,
 * which restores the one-day rule above.
 */
export const GO_LIVE_KEEP_WHILE_TESTING = true;
export const GO_LIVE_LIFETIME_MS = GO_LIVE_KEEP_WHILE_TESTING ? 365 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
/**
 * The hour is only a grace period for downloading. Once the customer has downloaded, it is wiped: this
 * short window just lets the file finish reaching the phone.
 */
export const AFTER_DOWNLOAD_MS = 2 * 60 * 1000;
export const afterDownloadExpiresAtMs = () => Date.now() + AFTER_DOWNLOAD_MS;

export const resultExpiresAtMs = () => Date.now() + RESULT_LIFETIME_MS;
export const resultExpiresAtIso = () => new Date(resultExpiresAtMs()).toISOString();
