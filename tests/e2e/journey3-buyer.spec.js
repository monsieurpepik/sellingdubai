// @ts-check
const { test, expect } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const AGENT_SLUG = 'boban-pepic';

// Mock Supabase REST API response with minimal agent data
// .single() sends Accept: application/vnd.pgrst.object+json — return a single object, not array
function mockAgentData(page) {
  const routePromise = page.route('https://pjyorgedaxevxophpfib.supabase.co/rest/v1/agents*', route => route.fulfill({
    status: 200,
    contentType: 'application/vnd.pgrst.object+json',
    body: JSON.stringify({
      id: 'test-uuid-1234',
      slug: AGENT_SLUG,
      name: 'Boban Pepic',
      photo_url: null,
      background_image_url: null,
      verification_status: 'verified',
      tagline: 'Test Tagline',
      bio: 'Test bio',
      phone: '+971501234567',
      dld_broker_number: null,
      broker_number: '12345',
      dld_total_deals: 0,
      dld_total_volume_aed: 0,
      dld_verified: false,
      agency_name: 'Test Agency',
      agency_logo_url: null,
      whatsapp: '+971501234567',
      email: 'test@example.com',
      calendly_url: null,
      custom_link_1_url: null,
      custom_link_1_label: null,
      custom_link_2_url: null,
      custom_link_2_label: null,
      instagram_url: null,
      youtube_url: null,
      tiktok_url: null,
      linkedin_url: null,
      facebook_pixel_id: null,
      ga4_measurement_id: null,
      show_golden_visa: false,
      show_preapproval: true,
      tier: 'free',
      referral_code: null,
      stripe_subscription_status: null,
      stripe_current_period_end: null
    })
  }));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));
  return routePromise;
}

test('Agent profile page loads and shows #agent-page', async ({ page }) => {
  await mockAgentData(page);
  await page.goto(`/${AGENT_SLUG}`);
  const bodyHTML = await page.evaluate(() => document.getElementById('agent-page')?.className);
  console.log('agent-page class:', bodyHTML);
  await expect(page.locator('#agent-page')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#loading')).not.toBeVisible();
});

test('Mortgage modal opens and closes', async ({ page }) => {
  await mockAgentData(page);
  await page.goto(`/${AGENT_SLUG}`);
  const bodyHTML = await page.evaluate(() => document.getElementById('agent-page')?.className);
  console.log('agent-page class:', bodyHTML);
  await expect(page.locator('#agent-page')).toBeVisible({ timeout: 10000 });

  // Open mortgage modal via the button
  const mortgageBtn = page.locator('[data-track="mortgage"]');
  await expect(mortgageBtn).toBeVisible({ timeout: 5000 });
  await mortgageBtn.click();

  const modal = page.locator('#mortgage-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // Close via close button
  await page.locator('#mortgage-modal .modal-close').click();
  await expect(modal).not.toBeVisible({ timeout: 3000 });
});
