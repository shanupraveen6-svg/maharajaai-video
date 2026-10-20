// Central AI & System Configuration

export const AI_CONFIG = {
  get GEMINI_ANALYSIS_MODEL() {
    return process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
  },
  get GEMINI_OCR_MODEL() {
    return process.env.GEMINI_OCR_MODEL || 'gemini-3.5-flash-lite';
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
};
