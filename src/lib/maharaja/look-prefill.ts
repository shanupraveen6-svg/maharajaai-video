/** Photos carried from a Try-On look into its festival video pass, kept only in the phone's session storage. */
export type LookPrefill = {
  personPhoto: string;
  garmentPhotos: string[];
  garmentType?: string;
};

export const LOOK_PREFILL_KEY = (passCode: string) => `tryfocus:look-prefill:${passCode}`;
