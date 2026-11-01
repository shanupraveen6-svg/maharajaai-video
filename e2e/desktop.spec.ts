import { expect, test } from '@playwright/test';
import { expectMockBackend, signInAsAdmin } from './helpers';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';

test.beforeEach(async ({ request }) => { await expectMockBackend(request); });

test('Pricing: platform + credits calculator, one-time software, package total, no per-credit prices', async ({ page }) => {
  await page.goto('/#pricing');
  const pricing = page.locator('#pricing');
  await expect(pricing.getByRole('heading', { name: 'TV, tablet or phone?' })).toBeVisible();
  for (const name of ['TV', 'Tablet', 'Phone']) await expect(pricing.getByRole('radio', { name: new RegExp(`^${name}`) })).toBeVisible();
  // Standard TV: ₹80,000 software + ₹1,03,000 credits + 18% GST.
  await expect(pricing.getByText('₹1,03,000')).toBeVisible();
  await expect(pricing.getByText('₹2,15,940')).toBeVisible();
  await pricing.screenshot({ path: `${SHOTS}/desktop-pricing-tv.png` });
  // Phone: Try-On only; AI Video and Live Mirror are not on this platform.
  await pricing.getByRole('radio', { name: /^Phone/ }).click();
  await expect(pricing.getByLabel('AI Videos')).toBeDisabled();
  await expect(pricing.getByText('₹20,000').first()).toBeVisible();
  await expect(pricing).not.toContainText('per credit');
  await pricing.screenshot({ path: `${SHOTS}/desktop-pricing-phone.png` });
});

test('TryFocus admin: platform, Standard/Pro/Premium, top-up with price and profit', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'TryFocus admin' })).toBeVisible();
  await page.getByRole('combobox').first().selectOption({ index: 1 });
  await expect(page.getByRole('heading', { name: 'Platform', exact: true })).toBeVisible();
  for (const name of ['TV', 'Tablet', 'Phone', 'TV and tablet']) await expect(page.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await expect(page.getByText('Live Mirror add-on')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Set to Standard/ })).toBeVisible();
  await expect(page.getByText('Top up')).toBeVisible();
  await expect(page.getByText('Credit profit')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-admin-client.png`, fullPage: true });
});

test('Client workspace: tabs, catalogue grid, the AI Video gift QR with New customer, and Customers', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/maharaja/workspace');
  const tabs = page.getByRole('navigation', { name: 'Workspace sections' });
  for (const name of ['Overview', 'Catalogue', 'AI Video gift', 'Wall QR', 'Go Live & videos', 'Customers']) await expect(tabs.getByRole('button', { name })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-workspace-overview.png`, fullPage: true });

  await tabs.getByRole('button', { name: 'Catalogue' }).click();
  await expect(page.getByRole('heading', { name: 'Your catalogue' })).toBeVisible();

  await tabs.getByRole('button', { name: 'AI Video gift' }).click();
  await expect(page.getByRole('heading', { name: 'Piece the customer bought' })).toBeVisible();
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

  await tabs.getByRole('button', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download CSV/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-workspace-customers.png`, fullPage: true });
});
