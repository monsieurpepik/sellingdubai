// @ts-check
// FAQ toggle — handles buttons with data-action="toggleFaq"
document.addEventListener('click', (e) => {
  var btn = e.target.closest('[data-action="toggleFaq"]');
  if (!btn) return;
  var el = btn.closest('.faq-item');
  if (!el) return;
  var wasOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach((i) => { i.classList.remove('open'); });
  if (!wasOpen) el.classList.add('open');
});

// Scroll reveal
var _revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach((el) => { _revealObserver.observe(el); });

// Agent count from Supabase (depends on window.SD_CONFIG set by sd-config.js)
(() => {
  var cfg = window.SD_CONFIG;
  if (!cfg) return;
  fetch(`${cfg.SUPABASE_URL}/rest/v1/agents?select=id&verification_status=eq.verified`, {
    headers: { 'apikey': cfg.SUPABASE_ANON_KEY, 'Prefer': 'count=exact', 'Range': '0-0' }
  }).then((res) => {
    var countHeader = res.headers.get('content-range');
    if (countHeader) {
      var total = parseInt(countHeader.split('/')[1], 10);
      if (!Number.isNaN(total) && total > 0) {
        var el = document.getElementById('agent-count-live');
        if (el) el.textContent = total.toLocaleString();
      }
    }
  }).catch(() => {});
})();

// Lazy-load GA4 after page load with 2-second delay
window.addEventListener('load', () => {
  setTimeout(() => {
    var s = document.createElement('script');
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-BXMRWM9ZM1';
    s.async = true;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-BXMRWM9ZM1');
  }, 2000);
});
