// @ts-check
(function(){
  var CONSENT_KEY = 'sd_cookie_consent';
  var stored = null;
  try { stored = localStorage.getItem(CONSENT_KEY); } catch(e){}
  if (!stored) {
    setTimeout(function(){ document.getElementById('cookie-banner').classList.add('show'); }, 1200);
  }
  window.__sdCookieConsent = function(choice) {
    try { localStorage.setItem(CONSENT_KEY, choice); } catch(e){}
    document.getElementById('cookie-banner').classList.remove('show');
    if (choice === 'reject') {
      // Disable non-essential tracking — use the actual GA4 property ID loaded per-agent
      var gaId = window.__sd_ga_id;
      if (gaId) window['ga-disable-' + gaId] = true;
      if (window.fbq) window.fbq('consent', 'revoke');
    }
  };
})();
