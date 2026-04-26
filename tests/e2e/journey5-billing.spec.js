// @ts-check
const { test, expect } = require('@playwright/test');

test('Pricing page does not have noindex meta tag', async ({ page }) => {
  await page.goto('/pricing.html');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('Pricing page upgrade buttons are visible', async ({ page }) => {
  await page.goto('/pricing.html');
  await expect(page.locator('.upgrade-btn[data-plan="pro"]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.upgrade-btn[data-plan="premium"]')).toBeVisible();
});

test('Billing gate blocks create-checkout when BILLING_LIVE=false', async ({ page }) => {
  const checkoutCalled = { value: false };

  // Force BILLING_LIVE=false via runtime flag before page scripts run
  await page.addInitScript(() => {
    window.SD_FLAGS = { BILLING_LIVE: false };
  });

  await page.route('**/create-checkout**', route => {
    checkoutCalled.value = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.com' }) });
  });

  await page.goto('/pricing.html');
  const proBtn = page.locator('.upgrade-btn[data-plan="pro"]');
  await expect(proBtn).toBeVisible({ timeout: 8000 });

  // BILLING_LIVE=false: applyBillingGate() disables the button on load — no click needed
  await expect(proBtn).toBeDisabled({ timeout: 3000 });
  await expect(proBtn).toHaveText('Coming Soon');
  expect(checkoutCalled.value).toBe(false);
});
