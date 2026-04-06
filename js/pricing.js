// @ts-check
// Billing toggle
var toggle = document.getElementById('billing-toggle');
var monthlyEls = document.querySelectorAll('.price-monthly');
var yearlyEls = document.querySelectorAll('.price-yearly');
var saveBadges = document.querySelectorAll('.price-save');
var intervalInputs = document.querySelectorAll('[data-interval]');

if (toggle) {
  toggle.addEventListener('change', () => {
    var isYearly = toggle.checked;
    monthlyEls.forEach((el) => { el.style.display = isYearly ? 'none' : 'block'; });
    yearlyEls.forEach((el) => { el.style.display = isYearly ? 'block' : 'none'; });
    saveBadges.forEach((el) => { el.style.display = isYearly ? 'block' : 'none'; });
    intervalInputs.forEach((el) => { el.dataset.interval = isYearly ? 'yearly' : 'monthly'; });
  });
}

// FAQ toggle
document.querySelectorAll('.faq-item').forEach((item) => {
  item.addEventListener('click', () => {
    var isActive = item.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach((el) => { el.classList.remove('active'); });
    if (!isActive) item.classList.add('active');
  });
});

// Flip to true via BILLING_LIVE=true env var in Netlify (patched at build time by scripts/build-js.js)
var BILLING_LIVE = false;

// Redirect to /edit for re-auth, preserving plan+interval for retry on return
function redirectToAuth(plan, interval) {
  sessionStorage.setItem('sd_pending_checkout', JSON.stringify({ plan: plan, interval: interval }));
  window.location.href = '/edit?return=/pricing';
}

async function startCheckout(plan, interval, btn) {
  if (!BILLING_LIVE) {
    if (btn) {
      var original = btn.textContent;
      btn.textContent = 'Billing coming soon';
      setTimeout(() => { btn.textContent = original; }, 2000);
    }
    return;
  }

  var token = localStorage.getItem('sd_edit_token');

  if (!token) {
    redirectToAuth(plan, interval);
    return;
  }

  if (btn) { btn.textContent = 'Loading...'; btn.disabled = true; }

  try {
    var res = await fetch('https://pjyorgedaxevxophpfib.supabase.co/functions/v1/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, plan: plan, interval: interval })
    });
    var data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else if (res.status === 409 && data.error === 'already_on_plan') {
      if (btn) { btn.textContent = 'Already on this plan'; btn.disabled = false; }
    } else if (res.status === 401 || (data.error?.toLowerCase().includes('session'))) {
      localStorage.removeItem('sd_edit_token');
      redirectToAuth(plan, interval);
    } else {
      alert(data.error || 'Failed to start checkout.');
      if (btn) { btn.textContent = 'Upgrade Now'; btn.disabled = false; }
    }
  } catch (_e) {
    alert('Something went wrong. Please try again.');
    if (btn) { btn.textContent = 'Upgrade Now'; btn.disabled = false; }
  }
}

// On return from /edit after re-auth, auto-retry the pending checkout
var pending = sessionStorage.getItem('sd_pending_checkout');
if (pending && localStorage.getItem('sd_edit_token') && BILLING_LIVE) {
  sessionStorage.removeItem('sd_pending_checkout');
  try {
    var _p = JSON.parse(pending);
    var matchingBtn = document.querySelector(`.upgrade-btn[data-plan="${_p.plan}"]`);
    startCheckout(_p.plan, _p.interval, matchingBtn);
  } catch (_e) { /* malformed sessionStorage value — ignore */ }
}

// Upgrade buttons
document.querySelectorAll('.upgrade-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    var plan = btn.dataset.plan;
    var interval = btn.dataset.interval || 'monthly';
    startCheckout(plan, interval, btn);
  });
});
