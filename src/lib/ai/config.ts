// Central AI & System Configuration

export const AI_CONFIG = {
  get GEMINI_ANALYSIS_MODEL() {
    return process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
  },
  get GEMINI_IMAGE_MODEL() {
    return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  },
  get GEMINI_VIDEO_MODEL() {
    return process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview';
  },
  get TV_SETUP_PIN() {
    // Strictly read from server environment variable. No hardcoded default.
    return process.env.TV_SETUP_PIN || '';
  },
  get ADMIN_PASSWORD() {
    return process.env.ADMIN_PASSWORD || '';
  },
  get IS_DEMO_MODE() {
    return false;
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
  get VIDEO_GENERATION_MODE() {
    return process.env.VIDEO_GENERATION_MODE || 'manual';
  }
};
