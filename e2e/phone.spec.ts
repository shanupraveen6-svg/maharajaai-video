import { expect, test } from '@playwright/test';
import { expectMockBackend, newGiftPass, signInAsAdmin } from './helpers';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

test('Gift QR: AI Video is store collection only, so it opens the outfit picker straight away', async ({ page }) => {
  await signInAsAdmin(page);
  const code = await newGiftPass(page.context().request);
  await page.context().clearCookies();
  await page.goto(`/maharaja/video/${code}`);
  await expect(page).toHaveURL(new RegExp(`/maharaja/catalogue/${code}`));
  await expect(page.getByRole('heading', { name: 'Choose your outfit' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Your collection/ })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/phone-gift-catalogue.png`, fullPage: true });
});

test('TV looks on the phone: nothing downloads by itself; Download asks for the WhatsApp number first', async ({ page }) => {
  await signInAsAdmin(page);
  const handoff = await (await page.context().request.post('/api/tv/tryon-handoff', {
    data: { looks: [{ sku: '8IC53071', title: 'Kanchivaram Silk Saree', image: PNG, category: 'sarees', garmentType: 'saree', gender: 'women' }] },
  })).json();
  expect(handoff.token).toBeTruthy();
  await page.context().clearCookies();
  await page.goto(`/maharaja/looks/${handoff.token}`);
  await page.getByRole('button', { name: 'Download this look' }).click();
  const form = page.getByRole('dialog', { name: 'Save to your phone' });
  await expect(form).toBeVisible();
  await form.getByLabel('WhatsApp number').fill('12345');
  await form.getByRole('button', { name: 'Download' }).click();
  await expect(form.getByRole('alert')).toContainText('10-digit');
  await form.getByLabel('WhatsApp number').fill('98765 43210');
  await page.screenshot({ path: `${SHOTS}/phone-lead-form.png`, fullPage: true });
  const download = page.waitForEvent('download');
  await form.getByRole('button', { name: 'Download' }).click();
  await download;
  await expect(form).toHaveCount(0);
});

test('Live Mirror video link: an unknown or expired link says so', async ({ page }) => {
  await page.goto('/maharaja/mirror/aaaaaaaaaaaaaaaaaaaaaaaa');
  await expect(page.getByRole('heading', { name: 'Video not available' })).toBeVisible();
});
