// @ts-check
const { test, expect } = require('@playwright/test');

test('Dashboard shows auth overlay when unauthenticated', async ({ page }) => {
  await page.goto('/dashboard.html');
  await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#btn-magic')).toBeVisible();
});

test('Dashboard magic link form shows error on empty email submit', async ({ page }) => {
  await page.goto('/dashboard.html');
  await expect(page.locator('#btn-magic')).toBeVisible({ timeout: 8000 });

  // Click without entering email
  await page.locator('#btn-magic').click();

  const errEl = page.locator('#auth-error');
  await expect(errEl).toBeVisible({ timeout: 3000 });
  await expect(errEl).toHaveText('Enter your email.');
});

test('Dashboard magic link form sends email and shows #auth-sent', async ({ page }) => {
  await page.route('**/send-magic-link**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));

  await page.goto('/dashboard.html');
  await expect(page.locator('#btn-magic')).toBeVisible({ timeout: 8000 });

  const emailInput = page.locator('#auth-email');
  await emailInput.fill('agent@example.com');
  await page.locator('#btn-magic').click();

  await expect(page.locator('#auth-sent')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#sent-email')).toHaveText('agent@example.com');
});
