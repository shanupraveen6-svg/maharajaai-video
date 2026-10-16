// Central AI & System Configuration

export const AI_CONFIG = {
  get GEMINI_ANALYSIS_MODEL() {
    return process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
  },
  get GEMINI_IMAGE_MODEL() {
    return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  },
  get ALLOW_MOCK_BACKEND() {
    return process.env.ALLOW_MOCK_BACKEND === 'true';
  },
  get PRIMARY_API_KEY() {
    return process.env.GOOGLE_AI_API_KEY_PRIMARY || '';
  },
  get FAL_KEY() {
    return process.env.FAL_KEY || process.env.FAL_AI_API_KEY || '';
  },
};
