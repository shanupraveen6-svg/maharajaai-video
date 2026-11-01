import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Signs this browser in as TryFocus admin (the cookie is shared with the page). */
export async function signInAsAdmin(page: Page) {
  const response = await page.context().request.post('/api/operator/login', { data: { username: 'e2e-admin', password: 'e2e-password' } });
  expect(response.ok()).toBeTruthy();
}

/** The mock backend must be running; a test run must never reach real Firebase. */
export async function expectMockBackend(request: APIRequestContext) {
  const health = await (await request.get('/api/health')).json();
  expect(health.backend, 'Tests must run on the mock backend').toBe('MOCK_STORE');
}

/** A fresh AI Video gift pass from Maharaja's billing link, as the biller's New customer button makes. */
export async function newGiftPass(request: APIRequestContext) {
  const workspace = await (await request.get('/api/maharaja/workspace?workspaceCode=workspace')).json();
  const billingCode = workspace.workspace.billingCode;
  const response = await request.post('/api/maharaja/video-pass', { data: { billingCode } });
  const data = await response.json();
  expect(data.success, data.error).toBeTruthy();
  return data.pass.code as string;
}
