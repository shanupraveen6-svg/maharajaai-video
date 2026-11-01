import { expect, test } from '@playwright/test';
import { expectMockBackend, signInAsAdmin } from './helpers';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';

test.beforeEach(async ({ request }) => { await expectMockBackend(request); });

test('Pricing: TV or tablet, two packages, phone-only by contact, no prices', async ({ page }) => {
  await page.goto('/#pricing');
  const pricing = page.locator('#pricing');
  await expect(pricing.getByRole('heading', { name: 'Do you want a TV or a tablet?' })).toBeVisible();
  await expect(pricing.getByRole('heading', { name: 'TV', exact: true })).toBeVisible();
  await expect(pricing.getByRole('heading', { name: 'Tablet', exact: true })).toBeVisible();
  await expect(pricing.getByText('Add-on: Live Mirror')).toHaveCount(1);
  await expect(pricing.getByText('Phone only platform')).toBeVisible();
  await expect(pricing).not.toContainText('₹');
  await pricing.screenshot({ path: `${SHOTS}/desktop-pricing.png` });
});

test('TryFocus admin: screens, Live Mirror add-on and credit packages', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'TryFocus admin' })).toBeVisible();
  await page.getByRole('combobox').first().selectOption({ index: 1 });
  await expect(page.getByRole('heading', { name: 'Package', exact: true })).toBeVisible();
  for (const name of ['TV', 'Tablet', 'TV and tablet']) await expect(page.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await expect(page.getByText('Live Mirror add-on')).toBeVisible();
  await expect(page.getByRole('button', { name: /Package 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Package 2/ })).toBeVisible();
  await expect(page.getByText(/Open .* workspace/)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/desktop-admin-client.png`, fullPage: true });
});

test('Client workspace: tabs, catalogue grid and the AI Video gift QR with New customer', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/maharaja/workspace');
  const tabs = page.getByRole('navigation', { name: 'Workspace sections' });
  for (const name of ['Overview', 'Catalogue', 'AI Video gift', 'Wall QR', 'Go Live & videos']) await expect(tabs.getByRole('button', { name })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-workspace-overview.png`, fullPage: true });

  await tabs.getByRole('button', { name: 'Catalogue' }).click();
  await expect(page.getByRole('heading', { name: 'Your catalogue' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-workspace-catalogue.png`, fullPage: true });

  await tabs.getByRole('button', { name: 'AI Video gift' }).click();
  await page.getByRole('button', { name: 'Show QR for this customer' }).click();
  await expect(page.getByAltText('AI Video gift QR for this customer')).toBeVisible();
  const first = await page.getByAltText('AI Video gift QR for this customer').getAttribute('src');
  await page.getByRole('button', { name: 'New customer' }).click();
  await expect(page.getByText('Customer 2')).toBeVisible();
  expect(await page.getByAltText('AI Video gift QR for this customer').getAttribute('src')).not.toBe(first);
  await page.screenshot({ path: `${SHOTS}/desktop-workspace-gift.png`, fullPage: true });

  await tabs.getByRole('button', { name: 'Go Live & videos' }).click();
  await expect(page.getByRole('heading', { name: 'Go Live player' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open player/ })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/desktop-workspace-golive.png`, fullPage: true });
});
