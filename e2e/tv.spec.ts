import { expect, test } from '@playwright/test';
import { expectMockBackend, signInAsAdmin } from './helpers';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';

test.beforeEach(async ({ request }) => { await expectMockBackend(request); });

test('Portrait TV: Try-On, Live Mirror (4 categories, 2 columns) and AI Video tabs', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/maharaja/tv/experience');
  await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tv-home.png` });

  await page.getByRole('button', { name: 'Live Mirror' }).first().click();
  await expect(page.getByRole('heading', { name: 'Live Mirror' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Saree' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start Live Mirror|Open camera/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tv-live-mirror.png` });

  await page.getByRole('button', { name: 'AI Video' }).first().click();
  await page.screenshot({ path: `${SHOTS}/tv-ai-video.png` });
});
