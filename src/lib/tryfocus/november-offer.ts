/** The November Phone offer runs through 30 November 2026 (India time); from 1 December it is gone. */
export const NOVEMBER_OFFER_ENDS_AT = Date.parse('2026-12-01T00:00:00+05:30');
export const novemberOfferActive = (now = Date.now()) => now < NOVEMBER_OFFER_ENDS_AT;
