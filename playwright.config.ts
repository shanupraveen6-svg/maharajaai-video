import { defineConfig, devices } from '@playwright/test';

// Browser checks of the real pages, against the in-memory mock backend: every Firebase and AI key is
// blanked so a run can never touch production data or spend AI credits. Run: npx playwright test
const blank = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_STORAGE_BUCKET', 'FAL_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY_PRIMARY', 'GENLOOK_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];

export const E2E_PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'retain-on-failure',
    // An installed Google Chrome, so no browser download is needed. Set E2E_CHROME_PATH if Chrome lives elsewhere.
    ...(process.env.E2E_CHROME_PATH ? {} : { channel: 'chrome' }),
    launchOptions: {
      ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}),
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec\.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /desktop\.spec\.ts/ },
    { name: 'tv', use: { ...devices['Desktop Chrome'], viewport: { width: 1080, height: 1920 } }, testMatch: /tv\.spec\.ts/ },
  ],
  webServer: {
    // A production build: what stores run, and no development-only reloads while pages compile.
    command: `npx next build && npx next start --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/api/version`,
    timeout: 420_000,
    reuseExistingServer: false,
    env: {
      ...Object.fromEntries(blank.map((key) => [key, ''])),
      ALLOW_MOCK_BACKEND: 'true',
      OPERATOR_AUTH_SECRET: 'e2e_secret_value_for_tests_only',
      OPERATOR_USERNAME: 'e2e-admin',
      OPERATOR_PASSWORD: 'e2e-password',
      CRON_SECRET: 'e2e-cron',
    },
  },
});
