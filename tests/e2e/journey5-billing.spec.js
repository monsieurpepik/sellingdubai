// @ts-check
const { test, expect } = require('@playwright/test');

test('Pricing page has noindex meta tag', async ({ page }) => {
  await page.goto('/pricing.html');
  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toContain('noindex');
});

test('Pricing page upgrade buttons are visible', async ({ page }) => {
  await page.goto('/pricing.html');
  await expect(page.locator('.upgrade-btn[data-plan="pro"]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.upgrade-btn[data-plan="premium"]')).toBeVisible();
});

test('Billing gate blocks create-checkout when BILLING_LIVE=false', async ({ page }) => {
  const checkoutCalled = { value: false };

  await page.route('**/create-checkout**', route => {
    checkoutCalled.value = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.com' }) });
  });

  await page.goto('/pricing.html');
  const proBtn = page.locator('.upgrade-btn[data-plan="pro"]');
  await expect(proBtn).toBeVisible({ timeout: 8000 });
  await proBtn.click();

  // BILLING_LIVE=false: button text changes to "Billing coming soon", checkout NOT called
  await expect(proBtn).toHaveText('Billing coming soon', { timeout: 3000 });
  expect(checkoutCalled.value).toBe(false);

  // Button reverts after 2s
  await expect(proBtn).toHaveText('Upgrade Now', { timeout: 5000 });
});
