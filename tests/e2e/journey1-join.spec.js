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

test('Join page shows step-1 contact info form on load', async ({ page }) => {
  await page.goto('/join.html');
  await expect(page.locator('#step-1')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#step-2')).not.toBeVisible();
  await expect(page.locator('#step-3')).not.toBeVisible();
  await expect(page.locator('#btn-step1-next')).toBeVisible();
});

test('Join page: completing step-1 contact info advances to step-2 RERA verification', async ({ page }) => {
  await page.goto('/join.html');
  await expect(page.locator('#step-1')).toBeVisible({ timeout: 8000 });

  await page.locator('#contact-name').fill('Test Agent');
  await page.locator('#contact-email').fill('agent@example.com');
  await page.locator('#contact-whatsapp').fill('+971501234567');
  await page.locator('#btn-step1-next').click();

  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#step-1')).not.toBeVisible();
});

test('Join page: valid broker number shows profile form and OTP section', async ({ page }) => {
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

  // Complete step-1 contact info
  await page.locator('#contact-name').fill('Test Agent');
  await page.locator('#contact-email').fill('agent@example.com');
  await page.locator('#contact-whatsapp').fill('+971501234567');
  await page.locator('#btn-step1-next').click();

  // Step-2: RERA broker verification
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });
  await page.locator('#broker-number').fill('12345');
  await page.locator('#btn-verify').click();

  // Profile details form appears after successful broker verify
  await expect(page.locator('#step-2-details')).toBeVisible({ timeout: 5000 });

  // Trigger OTP send
  await page.locator('#btn-create').click();
  await expect(page.locator('#otp-section')).toBeVisible({ timeout: 5000 });
});

test('Join page: refreshing after broker verification resumes at step-2', async ({ page }) => {
  await page.route('**/verify-broker**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      verified: true,
      license_active: true,
      broker: { name_en: 'Resume Test Agent', broker_number: '55555', license_end: '2027-06-30' }
    })
  }));

  await page.goto('/join.html');

  // Complete step-1
  await page.locator('#contact-name').fill('Resume Test Agent');
  await page.locator('#contact-email').fill('resume@example.com');
  await page.locator('#contact-whatsapp').fill('+971501234568');
  await page.locator('#btn-step1-next').click();

  // Complete step-2 broker verification
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });
  await page.locator('#broker-number').fill('55555');
  await page.locator('#btn-verify').click();
  await expect(page.locator('#step-2-details')).toBeVisible({ timeout: 5000 });

  // Reload to simulate returning agent
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Should resume at step-2 without re-verifying
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#step-1')).not.toBeVisible();
  await expect(page.locator('#verify-bn')).toContainText('55555');
});
