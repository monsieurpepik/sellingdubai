// @ts-check
const { test, expect } = require('@playwright/test');

test('Landing page loads and primary CTAs point to /join', async ({ page }) => {
  await page.goto('/landing.html');
  await page.waitForLoadState('domcontentloaded');
  const ctaLinks = page.locator('a[href="/join"]');
  await expect(ctaLinks.first()).toBeVisible({ timeout: 8000 });
  const count = await ctaLinks.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('Landing page has no broken waitlist anchors on primary CTAs', async ({ page }) => {
  await page.goto('/landing.html');
  await page.waitForLoadState('domcontentloaded');
  const staleAnchors = page.locator('a[href*="waitlist"]');
  await expect(staleAnchors).toHaveCount(0);
});

test('Join page shows step-1 broker verification on load', async ({ page }) => {
  await page.goto('/join.html');
  await expect(page.locator('#step-1')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#step-2')).not.toBeVisible();
  await expect(page.locator('#step-3')).not.toBeVisible();
  await expect(page.locator('#btn-verify')).toBeVisible();
});

test('Join page: valid broker number advances to step-2', async ({ page }) => {
  await page.route('**/verify-broker**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      verified: true,
      license_active: true,
      broker: { name_en: 'Test Agent', broker_number: '12345', license_end: '2026-12-31' }
    })
  }));

  await page.goto('/join.html');
  await expect(page.locator('#step-1')).toBeVisible({ timeout: 8000 });
  await page.locator('#broker-number').fill('12345');
  await page.locator('#btn-verify').click();

  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#step-1')).not.toBeVisible();
});

test('Join page: Create My Profile triggers send-otp and shows OTP section', async ({ page }) => {
  await page.route('**/verify-broker**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      verified: true,
      license_active: true,
      broker: { name_en: 'Test Agent', broker_number: '12345', license_end: '2026-12-31' }
    })
  }));
  await page.route('**/send-otp**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));

  await page.goto('/join.html');
  await expect(page.locator('#step-1')).toBeVisible({ timeout: 8000 });
  await page.locator('#broker-number').fill('12345');
  await page.locator('#btn-verify').click();
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });

  // Fill required step-2 fields and trigger OTP
  await page.locator('#whatsapp').fill('+971501234567');
  await page.locator('#email').fill('agent@example.com');
  await page.locator('#btn-create').click();

  await expect(page.locator('#otp-section')).toBeVisible({ timeout: 5000 });
});
