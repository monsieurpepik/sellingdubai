// @ts-check
// Billing toggle
const toggle = document.getElementById('billing-toggle');
const monthlyEls = document.querySelectorAll('.price-monthly');
const yearlyEls = document.querySelectorAll('.price-yearly');
const saveBadges = document.querySelectorAll('.price-save');
const intervalInputs = document.querySelectorAll('[data-interval]');

// FAQ items — cached once, re-used on every click
const faqItems = document.querySelectorAll('.faq-item');

if (toggle) {
  toggle.addEventListener('change', () => {
    const isYearly = toggle.checked;
    monthlyEls.forEach((el) => { el.style.display = isYearly ? 'none' : 'block'; });
    yearlyEls.forEach((el) => { el.style.display = isYearly ? 'block' : 'none'; });
    saveBadges.forEach((el) => { el.style.display = isYearly ? 'block' : 'none'; });
    intervalInputs.forEach((el) => { el.dataset.interval = isYearly ? 'yearly' : 'monthly'; });
  });
}

// FAQ toggle
faqItems.forEach((item) => {
  item.addEventListener('click', () => {
    const isActive = item.classList.contains('active');
    faqItems.forEach((el) => { el.classList.remove('active'); });
    if (!isActive) item.classList.add('active');
  });
});

// Redirect to /edit for re-auth, preserving plan+interval for retry on return
function redirectToAuth(plan, interval) {
  sessionStorage.setItem('sd_pending_checkout', JSON.stringify({ plan: plan, interval: interval }));
  window.location.href = '/edit?return=/pricing';
}

async function startCheckout(plan, interval, btn) {
  if (!window.SD_FLAGS?.BILLING_LIVE) {
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Billing coming soon';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
    return;
  }

  const token = localStorage.getItem('sd_edit_token');

  if (!token) {
    redirectToAuth(plan, interval);
    return;
  }

  if (btn) { btn.textContent = 'Loading...'; btn.disabled = true; }

  try {
    // Prefer runtime-injected URL, fall back to canonical SD_CONFIG (sd-config.js)
    const supabaseUrl = window.__SD_SUPABASE_URL__ || window.SD_CONFIG?.SUPABASE_URL || '';
    const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, plan: plan, interval: interval })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else if (res.status === 409 && data.error === 'already_on_plan') {
      if (btn) { btn.textContent = 'Already on this plan'; btn.disabled = false; }
    } else if (res.status === 401 || (data.error?.toLowerCase().includes('session'))) {
      localStorage.removeItem('sd_edit_token');
      redirectToAuth(plan, interval);
    } else {
      if (btn) {
        btn.textContent = data.error || 'Something went wrong';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Upgrade Now'; }, 3000);
      }
    }
  } catch (_e) {
    if (btn) {
      btn.textContent = 'Something went wrong — try again';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Upgrade Now'; }, 3000);
    }
  }
}

// On return from /edit after re-auth, auto-retry the pending checkout
const pending = sessionStorage.getItem('sd_pending_checkout');
if (pending && localStorage.getItem('sd_edit_token') && window.SD_FLAGS?.BILLING_LIVE) {
  sessionStorage.removeItem('sd_pending_checkout');
  try {
    const _p = JSON.parse(pending);
    const matchingBtn = document.querySelector(`.upgrade-btn[data-plan="${_p.plan}"]`);
    startCheckout(_p.plan, _p.interval, matchingBtn);
  } catch (_e) { /* malformed sessionStorage value — ignore */ }
}

// Upgrade buttons
document.querySelectorAll('.upgrade-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const plan = btn.dataset.plan;
    const interval = btn.dataset.interval || 'monthly';
    startCheckout(plan, interval, btn);
  });
});

// Disable upgrade buttons when billing is off (runtime flag from get-flags)
function applyBillingGate() {
  const live = window.SD_FLAGS?.BILLING_LIVE;
  document.querySelectorAll('.upgrade-btn').forEach((btn) => {
    if (!live) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
  });
  document.querySelectorAll('.billing-coming-soon').forEach((el) => {
    el.style.display = live ? 'none' : 'block';
  });
}
// SD_FLAGS loads async via sd-config.js — poll briefly
let _bgAttempts = 0;
const _bgPoll = setInterval(() => {
  _bgAttempts++;
  if (window.SD_FLAGS !== undefined || _bgAttempts >= 30) {
    clearInterval(_bgPoll);
    applyBillingGate();
  }
}, 100);
