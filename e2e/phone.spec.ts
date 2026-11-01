import { expect, test } from '@playwright/test';
import { expectMockBackend, newGiftPass, signInAsAdmin } from './helpers';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';

test.beforeEach(async ({ request }) => { await expectMockBackend(request); });

test('Wall QR opens Try-On on the phone, in English and Tamil', async ({ page }) => {
  await page.goto('/maharaja/mobile/experience');
  await expect(page.getByRole('heading', { name: 'What would you like to try?' })).toBeVisible();
  await expect(page.getByText('Store collection')).toBeVisible();
  await expect(page.getByText('AI Video', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/phone-wall-qr-en.png`, fullPage: true });
  await page.getByRole('button', { name: 'தமிழ்' }).click();
  await expect(page.getByRole('heading', { name: 'எதை அணிந்து பார்க்க விரும்புகிறீர்கள்?' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/phone-wall-qr-ta.png`, fullPage: true });
});

test('Gift QR: two boxes; "Your collection" opens the own-outfit video flow and cannot switch back', async ({ page }) => {
  await signInAsAdmin(page);
  const code = await newGiftPass(page.context().request);
  await page.context().clearCookies();
  await page.goto(`/maharaja/video/${code}`);
  const collection = page.getByRole('button', { name: /new collection/ });
  const own = page.getByRole('button', { name: /Your collection/ });
  await expect(collection).toBeVisible();
  await expect(own).toBeVisible();
  await expect(collection.locator('img').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/phone-gift-choice.png`, fullPage: true });
  await own.click();
  await expect(collection).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/phone-gift-own-flow.png`, fullPage: true });
  // Reopening the QR goes straight back to the chosen flow.
  await page.reload();
  await expect(page.getByRole('button', { name: /new collection/ })).toHaveCount(0);
});

test('Gift QR: "new collection" opens the outfit picker', async ({ page }) => {
  await signInAsAdmin(page);
  const code = await newGiftPass(page.context().request);
  await page.context().clearCookies();
  await page.goto(`/maharaja/video/${code}`);
  await page.getByRole('button', { name: /new collection/ }).click();
  await expect(page).toHaveURL(new RegExp(`/maharaja/catalogue/${code}`));
  await expect(page.getByRole('heading', { name: 'Choose your outfit' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/phone-gift-catalogue.png`, fullPage: true });
});

test('Live Mirror video link: an unknown or expired link says so', async ({ page }) => {
  await page.goto('/maharaja/mirror/aaaaaaaaaaaaaaaaaaaaaaaa');
  await expect(page.getByRole('heading', { name: 'Video not available' })).toBeVisible();
});
