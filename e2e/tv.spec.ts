import { expect, test } from '@playwright/test';
import { expectMockBackend, signInAsAdmin } from './helpers';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';

test.beforeEach(async ({ request }) => { await expectMockBackend(request); });

test('Portrait TV: Who → Store or own → full-screen camera with the upload QR; Live Mirror and AI Video', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/maharaja/tv/experience');
  await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who is it for?' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tv-who.png` });

  await page.getByRole('group', { name: 'Who is it for' }).getByRole('button', { name: 'Women' }).click();
  await expect(page.getByRole('heading', { name: 'What would you like to try?' })).toBeVisible();
  await expect(page.getByText('Try up to 3 outfits from this store')).toBeVisible();
  await page.getByRole('button', { name: /Store collection/ }).click();
  // The camera opens full screen at once, with a QR beside it to send a photo from the phone.
  const camera = page.getByRole('dialog', { name: 'Take your photo' });
  await expect(camera).toBeVisible();
  await expect(camera.getByAltText('Scan to send a photo from your phone')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tv-camera.png` });
  await camera.getByRole('button', { name: 'Close camera' }).click();

  await page.getByRole('button', { name: 'Live Mirror' }).first().click();
  await expect(page.getByRole('heading', { name: 'Live Mirror' })).toBeVisible();
  await expect(page.getByText(/30 seconds/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tv-live-mirror.png` });

  await page.getByRole('button', { name: 'AI Video' }).first().click();
  await page.screenshot({ path: `${SHOTS}/tv-ai-video.png` });
});

test('Own outfit: the outfit camera has no QR', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/maharaja/tv/experience');
  await page.getByRole('group', { name: 'Who is it for' }).getByRole('button', { name: 'Women' }).click();
  await page.getByRole('button', { name: /My own outfit/ }).click();
  const camera = page.getByRole('dialog', { name: 'Take your photo' });
  await expect(camera).toBeVisible();
  await camera.getByRole('button', { name: 'Close camera' }).click();
  // Without a photo the fallback page offers the camera or the phone.
  await expect(page.getByRole('heading', { name: 'Your photo' })).toBeVisible();
});

test('Counter tablet: the same flow, with New customer and the AI Video gift QR', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/maharaja/tablet/experience');
  await expect(page.getByRole('button', { name: 'New customer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who is it for?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live Mirror' })).toHaveCount(0);
  await page.getByRole('button', { name: 'AI Video gift' }).click();
  await expect(page.getByRole('button', { name: 'Show QR for this customer' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tablet-gift.png` });
});
