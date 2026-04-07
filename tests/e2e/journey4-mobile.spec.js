// @ts-check
const { test, expect } = require('@playwright/test');

const AGENT_SLUG = 'boban-pepic';

// Mirror of journey3-buyer mockAgentData — .single() returns object, not array
function mockAgentData(page) {
  return page.route('https://pjyorgedaxevxophpfib.supabase.co/rest/v1/agents*', route => route.fulfill({
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
}

test.use({ viewport: { width: 390, height: 844 } });

test('Landing page has no horizontal scroll at 390px width', async ({ page }) => {
  await page.goto('/landing.html');
  await page.waitForLoadState('domcontentloaded');

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('Index/agent page has no horizontal scroll at 390px width', async ({ page }) => {
  await mockAgentData(page);
  await page.goto(`/a/${AGENT_SLUG}`);
  await expect(page.locator('#agent-page')).toBeVisible({ timeout: 10000 });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('Join page has no horizontal scroll at 390px width', async ({ page }) => {
  await page.goto('/join.html');
  await page.waitForLoadState('domcontentloaded');

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
