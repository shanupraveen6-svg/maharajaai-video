// Central AI & System Configuration

export const AI_CONFIG = {
  get GEMINI_ANALYSIS_MODEL() {
    // Gemini 2.5 Flash is closed to new API keys; 3.8 Flash reads garments and photos.
    return process.env.GEMINI_ANALYSIS_MODEL || 'gemini-3.8-flash';
  },
  get GEMINI_OCR_MODEL() {
    return process.env.GEMINI_OCR_MODEL || 'gemini-3.5-flash-lite';
  },
  /** Own-outfit Try-On on Gemini (Nano Banana 2.1); the AI Video portrait keeps GEMINI_IMAGE_MODEL. */
  get GEMINI_TRYON_MODEL() {
    return process.env.GEMINI_TRYON_MODEL || 'gemini-nano-banana-2.1';
  },
  /** Own-outfit Try-On size on Gemini: '2K' (about 1536 × 2752, sharp on a 43-inch TV) or '1K'. */
  get GEMINI_TRYON_SIZE() {
    return String(process.env.GEMINI_TRYON_SIZE || '2K').toUpperCase() === '1K' ? '1K' : '2K';
  },
  get GEMINI_IMAGE_MODEL() {
    return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  },
  get ALLOW_MOCK_BACKEND() {
    return process.env.VERCEL_ENV !== 'production' && process.env.ALLOW_MOCK_BACKEND === 'true';
  },
  get PRIMARY_API_KEY() {
    return process.env.GOOGLE_AI_API_KEY_PRIMARY || '';
  },
  get GENLOOK_API_KEY() {
    return process.env.GENLOOK_API_KEY?.trim() || '';
  },
};
