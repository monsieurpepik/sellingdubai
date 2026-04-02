// @ts-check
const { test, expect } = require('@playwright/test');

// NOTE: The `agencies` table is currently empty in production (no rows).
// Using `boban-pepic` from the `agents` table as the first real production slug
// until agency records are created.
const AGENCY_SLUG = 'boban-pepic';

test('Agency dashboard shows auth gate when unauthenticated', async ({ page }) => {
  await page.goto('/agency-dashboard.html');
  await expect(page.locator('#auth-gate')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#auth-gate h2')).toHaveText('Not logged in');
  await expect(page.locator('#dashboard-section')).not.toBeVisible();
  await expect(page.locator('#create-section')).not.toBeVisible();
});

test('Agency dashboard with valid token in localStorage loads past auth gate', async ({ page }) => {
  await page.route('**/manage-agency**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ agency: null })
  }));
  await page.addInitScript(() => {
    localStorage.setItem('sd_edit_token', 'fake-token-for-testing');
  });
  await page.goto('/agency-dashboard.html');
  await page.waitForTimeout(3000);
  await expect(page.locator('#auth-gate')).not.toBeVisible();
  await expect(page.locator('#create-section')).toBeVisible();
});
