// ==========================================
// MORTGAGE FLOW (Multi-step)
// ==========================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { escHtml, escAttr } from './utils.js';
import { logEvent } from './analytics.js';
import { currentAgent } from './state.js';

const _mortStateDefaults = {
  mode:      'standard',   // 'standard' | 'offplan'
  step:      1,
  term:      25,
  rate:      3.99,
  appId:     null,
  editToken: null,
  project:   null,         // { name, minPrice, milestones, completionDate } — offplan only
  data: {
    employment: 'salaried',
    residency:  'uae_resident',
  },
  rates:     [],
};

let _mortState = { ..._mortStateDefaults, data: { ..._mortStateDefaults.data } };

// _eiborRate stays separate — it's cached external data, not per-session state
let _eiborRate = null;

const fmtAEDMort = (n) => 'AED ' + Math.round(n).toLocaleString();

window.openMortgage = function() {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  // Reset to standard mode on direct open
  _mortState = { ..._mortStateDefaults, data: { ..._mortStateDefaults.data } };
  _mortRatesLoadFailed = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  mortGoStep(1);
  loadMortgageRates();
  loadEiborRate();
  const leadCapture = document.getElementById('mort-lead-capture');
  if (leadCapture) leadCapture.style.display = 'none';
  const checkBtn = document.getElementById('mort-check-btn');
  if (checkBtn) checkBtn.style.display = '';
  const eligResult = document.getElementById('mort-elig-result');
  if (eligResult) eligResult.style.display = 'none';
  // Auto-fill property value from current property
  if (window._currentProperty) {
    const p = window._currentProperty;
    const priceNum = parseFloat(String(p.price || '').replace(/[^0-9.]/g, ''));
    if (priceNum > 0) {
      const valInput = document.getElementById('mort-value');
      if (valInput) valInput.value = Math.round(priceNum).toLocaleString('en-US');
      const dpSlider = document.getElementById('mort-dp-slider');
      if (dpSlider) {
        const minDp = _mortState.data.residency === 'uae_national' ? 15 : (_mortState.data.residency === 'non_resident' ? 50 : 20);
        dpSlider.min = minDp;
        dpSlider.value = minDp;
        const dpPctEl = document.getElementById('mort-dp-pct');
        if (dpPctEl) dpPctEl.textContent = minDp + '%';
        const minLabel = dpSlider.parentElement?.querySelector('span');
        if (minLabel) minLabel.textContent = minDp + '%';
      }
    }
  }
  logEvent('mortgage_calc_open', { property: window._currentProperty?.title || null });
};

window.initMortModal = function(opts = {}) {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  // Merge opts over defaults; deep-clone data to avoid mutation
  _mortState = {
    ..._mortStateDefaults,
    ...opts,
    data: { ..._mortStateDefaults.data, ...(opts.data || {}) },
  };
  _mortRatesLoadFailed = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  mortGoStep(1);
  loadMortgageRates();
  loadEiborRate();
  const leadCapture = document.getElementById('mort-lead-capture');
  if (leadCapture) leadCapture.style.display = 'none';
  const checkBtn = document.getElementById('mort-check-btn');
  if (checkBtn) checkBtn.style.display = '';
  const eligResult = document.getElementById('mort-elig-result');
  if (eligResult) eligResult.style.display = 'none';
  logEvent('mortgage_calc_open', { mode: _mortState.mode, project: _mortState.project?.name || null });
};

window.closeMortgage = function() {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
};

function renderMortOffPlanStep1() {
  const step1 = document.getElementById('mort-step-1');
  if (!step1 || !_mortState.project) return;

  const proj    = _mortState.project;
  const price   = proj.minPrice || 0;
  const miles   = Array.isArray(proj.milestones) ? proj.milestones : [];
  const fmtPct  = (pct) => `${pct}%`;
  const fmtAmt  = (n)   => 'AED ' + Math.round(n).toLocaleString();

  // Derive milestone buckets
  const booking      = miles.find(m => m.trigger === 'on_booking')          || miles[0];
  const handover     = miles.find(m => m.trigger === 'on_handover')         || miles[miles.length - 1];
  const construction = miles.filter(m => m !== booking && m !== handover);

  const bookingPct   = booking?.percentage   || 0;
  const handoverPct  = handover?.percentage  || 0;
  const constPct     = construction.reduce((sum, m) => sum + (m.percentage || 0), 0);

  const bookingAmt    = price * bookingPct / 100;
  const constAmt      = price * constPct   / 100;
  const handoverAmt   = price * handoverPct / 100;
  const dldFee        = price * 0.04;
  const agentComm     = price * 0.02;
  const totalCash     = bookingAmt + dldFee + agentComm;
  const loanAmount    = handoverAmt;

  const completionStr = proj.completionDate
    ? (() => { const d = new Date(proj.completionDate); return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`; })()
    : 'TBC';

  const milestoneRows = [
    { label: `Booking (${fmtPct(bookingPct)})`,      amount: bookingAmt  },
    { label: `Construction (${fmtPct(constPct)})`,   amount: constAmt    },
    { label: `Handover (${fmtPct(handoverPct)})`,    amount: handoverAmt },
    { label: 'DLD Fee (4%)',                          amount: dldFee      },
  ];

  const rowsHtml = milestoneRows.map(r =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:12px;color:rgba(255,255,255,0.5);">${escHtml(r.label)}</span>
      <span style="font-size:12px;color:#fff;font-weight:600;">${fmtAmt(r.amount)}</span>
    </div>`
  ).join('');

  step1.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">${escHtml(proj.name)} · Completion ${escHtml(completionStr)}</div>
      <div style="font-size:10px;font-weight:600;color:rgba(77,101,255,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Payment Breakdown</div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
        ${rowsHtml}
        <div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:4px;">
          <label style="font-size:12px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="mort-op-agent-check" checked
              onchange="_mortOpToggleAgent(this.checked)"
              style="accent-color:#4d65ff;width:14px;height:14px;">
            Agent commission (2%)
          </label>
          <span id="mort-op-agent-amt" style="font-size:12px;color:#fff;font-weight:600;">${fmtAmt(agentComm)}</span>
        </div>
      </div>
    </div>

    <div style="background:rgba(17,39,210,0.08);border:1px solid rgba(17,39,210,0.18);border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:12px;color:rgba(255,255,255,0.45);">Total cash required at booking</span>
        <span id="mort-op-cash" style="font-size:12px;color:#fff;font-weight:700;">${fmtAmt(totalCash)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:12px;color:rgba(255,255,255,0.45);">Mortgage loan amount (at handover)</span>
        <span style="font-size:12px;color:#fff;font-weight:700;">${fmtAmt(loanAmount)}</span>
      </div>
    </div>

    <button class="modal-btn" onclick="mortOpProceed()"
      style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">
      Calculate Mortgage Payments
    </button>`;

  // Store for toggling and for step 2 pre-fill
  _mortState.data._opBookingAmt   = bookingAmt;
  _mortState.data._opDldFee       = dldFee;
  _mortState.data._opAgentComm    = agentComm;
  _mortState.data._opLoanAmount   = loanAmount;
  _mortState.data._opTotalCash    = totalCash;
  _mortState.data._opIncludeAgent = true;
}

window._mortOpToggleAgent = function(checked) {
  _mortState.data._opIncludeAgent = checked;
  const agentAmtEl = document.getElementById('mort-op-agent-amt');
  const cashEl     = document.getElementById('mort-op-cash');
  const agentComm  = _mortState.data._opAgentComm || 0;
  const base       = (_mortState.data._opBookingAmt || 0) + (_mortState.data._opDldFee || 0);
  const newCash    = checked ? base + agentComm : base;
  _mortState.data._opTotalCash = newCash;
  if (agentAmtEl) agentAmtEl.textContent = checked ? 'AED ' + Math.round(agentComm).toLocaleString() : 'AED 0';
  if (cashEl)     cashEl.textContent     = 'AED ' + Math.round(newCash).toLocaleString();
};

window.mortOpProceed = function() {
  // Pre-fill the property value in step 2 with the loan amount
  const valInput = document.getElementById('mort-value');
  if (valInput && _mortState.data._opLoanAmount) {
    valInput.value = Math.round(_mortState.data._opLoanAmount).toLocaleString('en-US');
  }
  mortGoStep(2);
};

window.mortGoStep = function(step) {
  _mortState.step = step;
  document.querySelectorAll('.mort-step').forEach(s => s.style.display = 'none');
  const el = document.getElementById('mort-step-' + step);
  if (el) el.style.display = 'block';
  // Off-plan mode: replace step 1 content with milestone breakdown
  if (step === 1 && _mortState.mode === 'offplan') {
    renderMortOffPlanStep1();
  }
  // Scroll modal back to top on every step change
  const modal = document.querySelector('#mortgage-modal .modal');
  if (modal) modal.scrollTop = 0;
  const dots = document.querySelectorAll('.mort-step-dot');
  dots.forEach((d, i) => {
    d.classList.remove('active', 'done');
    if (i < step - 1) d.classList.add('done');
    if (i === step - 1) d.classList.add('active');
  });
  const titles = _mortState.mode === 'offplan'
    ? ['Payment Breakdown', 'Compare Rates', 'Your Details', 'You\'re Pre-Qualified']
    : ['Check Your Eligibility', 'Compare Rates', 'Your Details', 'You\'re Pre-Qualified'];
  const titleEl = document.getElementById('mort-step-title');
  if (titleEl) titleEl.textContent = titles[step - 1] || '';
  if (step === 2) {
    // Sync down payment slider to residency LTV rules
    const dpSlider = document.getElementById('mort-dp-slider');
    if (dpSlider) {
      const minDp = _mortState.data.residency === 'uae_national' ? 15 : (_mortState.data.residency === 'non_resident' ? 50 : 20);
      dpSlider.min = minDp;
      if (parseInt(dpSlider.value) < minDp) dpSlider.value = minDp;
      const dpPctEl = document.getElementById('mort-dp-pct');
      if (dpPctEl) dpPctEl.textContent = dpSlider.value + '%';
    }
    renderBankCards();
    renderEiborBadge();
    // Auto-calculate if property value is pre-filled
    const valInput = document.getElementById('mort-value');
    if (valInput && valInput.value) calcMortgage();
  }
};

window.setMortField = function(btn, field, value) {
  _mortState.data[field] = value;
  btn.parentElement.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.setMortTerm = function(btn, years) {
  _mortState.term = years;
  btn.parentElement.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBankCards();
  calcMortgage();
};

let _mortRatesLoadFailed = false;

async function loadMortgageRates() {
  if (_mortState.rates.length > 0) return;
  _mortRatesLoadFailed = false;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/mortgage_rates?is_active=eq.true&order=rate_pct.asc', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    });
    if (res.ok) {
      _mortState.rates = await res.json();
    } else {
      console.error('[mortgage] rates fetch failed:', res.status);
      _mortRatesLoadFailed = true;
    }
  } catch (e) {
    console.error('Failed to load mortgage rates:', e);
    _mortRatesLoadFailed = true;
  }
  renderBankCards();
}

async function loadEiborRate() {
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/fetch-eibor', {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    });
    if (!res.ok) { console.warn('[eibor] fetch returned', res.status, '— using fallback rate'); return; }
    const data = await res.json();
    if (data.rate > 0) {
      _eiborRate = { rate: data.rate, spread: 1.5 };
      renderEiborBadge();
      // Update the default rate used before a bank is selected
      if (_mortState.rate === 3.99) _mortState.rate = +(data.rate + 1.5).toFixed(2);
    }
  } catch (e) {
    console.warn('EIBOR fetch failed, using hardcoded fallback rate:', e);
  }
}

function renderEiborBadge() {
  const r = _eiborRate;
  if (!r) return;
  const total = (r.rate + r.spread).toFixed(2);
  const badgeHtml = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:12px;background:rgba(17,39,210,0.08);border:1px solid rgba(17,39,210,0.18);border-radius:8px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(17,39,210,0.7)" style="flex-shrink:0;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
    <span style="font-size:10px;color:rgba(255,255,255,0.5);font-weight:400;">Current rate: <strong style="color:#fff;font-weight:700;">${total}%</strong>&nbsp;&nbsp;·&nbsp;&nbsp;EIBOR ${r.rate.toFixed(2)}% + ${r.spread}% bank spread</span>
  </div>`;

  // Step 1: upsert badge before #mort-elig-result
  const s1Target = document.getElementById('mort-elig-result');
  if (s1Target) {
    let el = document.getElementById('mort-eibor-badge-s1');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mort-eibor-badge-s1';
      s1Target.parentElement?.insertBefore(el, s1Target);
    }
    el.innerHTML = badgeHtml;
  }

  // Step 2: upsert badge before #mort-bank-cards
  const s2Target = document.getElementById('mort-bank-cards');
  if (s2Target) {
    let el = document.getElementById('mort-eibor-badge-s2');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mort-eibor-badge-s2';
      s2Target.parentElement?.insertBefore(el, s2Target);
    }
    el.innerHTML = badgeHtml;
  }
}

function filterRatesForProfile(rates) {
  const income = _mortState.data.income || 0;
  const residency = _mortState.data.residency || 'uae_resident';
  const employment = _mortState.data.employment || 'salaried';
  const maxLtv = residency === 'uae_national' ? 85 : (residency === 'non_resident' ? 50 : 80);

  return rates.filter(r => {
    // Filter by minimum income requirement
    if (r.min_income_aed && income > 0 && income < r.min_income_aed) return false;
    // Filter by LTV compatibility
    if (r.max_ltv_pct && r.max_ltv_pct < maxLtv) return false;
    // Filter by term range
    if (r.min_term_years && _mortState.term < r.min_term_years) return false;
    if (r.max_term_years && _mortState.term > r.max_term_years) return false;
    return true;
  });
}

function renderBankCards() {
  const container = document.getElementById('mort-bank-cards');
  if (!container) return;
  const allRates = _mortState.rates;
  if (!allRates.length) {
    container.innerHTML = _mortRatesLoadFailed
      ? '<div style="text-align:center;padding:20px;color:rgba(255,100,100,0.4);font-size:12px;">Rates temporarily unavailable — close and reopen to retry.</div>'
      : '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:12px;">Loading rates...</div>';
    return;
  }
  // Apply smart filtering based on buyer profile
  const rates = filterRatesForProfile(allRates);

  const types = ['fixed_1yr', 'fixed_3yr', 'fixed_5yr', 'variable', 'islamic_fixed', 'islamic_variable'];
  const typeLabels = { fixed_1yr: '1yr Fixed', fixed_3yr: '3yr Fixed', fixed_5yr: '5yr Fixed', variable: 'Variable', islamic_fixed: 'Islamic Fixed', islamic_variable: 'Islamic Variable' };
  const best = [];
  types.forEach(t => {
    const match = rates.filter(r => r.product_type === t).sort((a, b) => a.rate_pct - b.rate_pct)[0];
    if (match) best.push(match);
  });

  // Fallback: if filtering killed everything, show all rates unfiltered
  if (best.length === 0) {
    types.forEach(t => {
      const match = allRates.filter(r => r.product_type === t).sort((a, b) => a.rate_pct - b.rate_pct)[0];
      if (match) best.push(match);
    });
  }

  const valInput = document.getElementById('mort-value');
  const dpSlider = document.getElementById('mort-dp-slider');
  const propVal = valInput ? parseFloat(valInput.value.replace(/[^0-9.]/g, '')) || 0 : 0;
  const dpPct = dpSlider ? parseInt(dpSlider.value) / 100 : 0.2;
  const loanAmt = propVal * (1 - dpPct);

  // Rate freshness indicator
  const latestUpdate = allRates.reduce((latest, r) => {
    const d = r.last_updated || r.created_at;
    return d > latest ? d : latest;
  }, '');
  const freshLabel = latestUpdate ? new Date(latestUpdate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';

  let html = '';

  // "Matched to you" badge if we have profile data
  if (_mortState.data.income > 0) {
    const residencyLabel = { uae_national: 'UAE National', uae_resident: 'Resident', non_resident: 'Non-Resident' };
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:10px;color:rgba(77,101,255,0.8);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Matched to your profile</span>
      <span style="font-size:9px;color:rgba(255,255,255,0.2);font-weight:300;">${residencyLabel[_mortState.data.residency] || ''} · ${_mortState.data.employment === 'salaried' ? 'Salaried' : _mortState.data.employment === 'self_employed' ? 'Self-Employed' : 'Business Owner'}</span>
    </div>`;
  }

  // Bank brand colors for logo badges
  const bankColors = {
    'Standard Chartered': '#0072AA', 'HSBC': '#DB0011', 'Emirates NBD': '#F26522',
    'Emirates Islamic': '#00843D', 'Dubai Islamic Bank': '#00543C', 'ADCB': '#B8860B',
    'ADIB': '#6B2D73', 'FAB': '#004B87', 'Mashreq': '#E31937', 'RAK Bank': '#C8102E'
  };
  const bankAbbrev = {
    'Standard Chartered': 'SC', 'HSBC': 'HS', 'Emirates NBD': 'EN',
    'Emirates Islamic': 'EI', 'Dubai Islamic Bank': 'DIB', 'ADCB': 'AD',
    'ADIB': 'AB', 'FAB': 'FA', 'Mashreq': 'MQ', 'RAK Bank': 'RK'
  };

  html += best.map((r, i) => {
    let monthlyStr = '';
    if (loanAmt > 0) {
      const mr = (r.rate_pct / 100) / 12;
      const np = _mortState.term * 12;
      const mp = loanAmt * (mr * Math.pow(1 + mr, np)) / (Math.pow(1 + mr, np) - 1);
      monthlyStr = fmtAEDMort(mp) + '/mo';
    }
    const bestTag = i === 0 ? '<span style="font-size:8px;background:rgba(37,211,102,0.15);color:#25d366;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:6px;">BEST RATE</span>' : '';
    const bgColor = bankColors[r.bank_name] || '#4d65ff';
    const abbrev = bankAbbrev[r.bank_name] || r.bank_name.slice(0, 2).toUpperCase();
    const logoBadge = `<div style="width:28px;height:28px;border-radius:6px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:10px;"><span style="font-size:9px;font-weight:800;color:#fff;letter-spacing:-0.3px;">${abbrev}</span></div>`;
    return `<div class="mort-bank-card${i === 0 ? ' active' : ''}" onclick="selectBankRate(this,${r.rate_pct},'${escAttr(r.bank_name)}')" style="display:flex;align-items:center;">
      ${logoBadge}
      <div style="flex:1;min-width:0;"><div class="mort-bank-name">${escHtml(r.bank_name)}${bestTag}</div><div class="mort-bank-product">${typeLabels[r.product_type] || r.product_type}${r.is_islamic ? ' · Sharia' : ''}</div></div>
      <div style="text-align:right;"><div class="mort-bank-rate">${r.rate_pct}%</div>${monthlyStr ? `<div class="mort-bank-monthly">${monthlyStr}</div>` : ''}</div>
    </div>`;
  }).join('');

  // Rate freshness footer
  if (freshLabel) {
    html += `<div style="text-align:center;padding:6px 0 0;"><span style="font-size:9px;color:rgba(255,255,255,0.15);font-weight:300;">Rates as of ${freshLabel} · ${best.length} banks matched</span></div>`;
  }

  container.innerHTML = html;
  if (best.length > 0) _mortState.rate = best[0].rate_pct;
}

window.selectBankRate = function(card, rate, bankName) {
  _mortState.rate = rate;
  _mortState.data.selectedBank = bankName;
  card.parentElement.querySelectorAll('.mort-bank-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  calcMortgage();
};

window.calcMortgage = function() {
  const valInput = document.getElementById('mort-value');
  const dpSlider = document.getElementById('mort-dp-slider');
  const dpPctEl = document.getElementById('mort-dp-pct');
  const resultsEl = document.getElementById('mort-results');
  if (!valInput || !dpSlider) return;
  const rawVal = parseFloat(valInput.value.replace(/[^0-9.]/g, ''));
  const dpPct = parseInt(dpSlider.value) / 100;
  if (dpPctEl) dpPctEl.textContent = dpSlider.value + '%';
  if (!rawVal || rawVal <= 0) { if (resultsEl) resultsEl.style.display = 'none'; renderBankCards(); return; }
  const loanAmt = rawVal * (1 - dpPct);
  const monthlyRate = (_mortState.rate / 100) / 12;
  const numPayments = _mortState.term * 12;
  const monthlyPayment = loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  const totalInterest = (monthlyPayment * numPayments) - loanAmt;
  _mortState.data.loanAmt        = loanAmt;
  _mortState.data.monthlyPayment = monthlyPayment;
  _mortState.data.totalInterest  = totalInterest;
  const me = document.getElementById('mort-monthly');
  const le = document.getElementById('mort-loan');
  const ie = document.getElementById('mort-interest');
  if (me) me.textContent = fmtAEDMort(monthlyPayment);
  if (le) le.textContent = fmtAEDMort(loanAmt);
  if (ie) ie.textContent = fmtAEDMort(totalInterest);
  if (resultsEl) resultsEl.style.display = 'block';
  renderBankCards();
};

window.mortCheckEligibility = function() {
  const incomeInput = document.getElementById('mort-income');
  const debtInput = document.getElementById('mort-debt');
  if (!incomeInput) return;
  const income = parseFloat(incomeInput.value.replace(/[^0-9.]/g, ''));
  // Clear any previous error
  const prevErr = incomeInput.parentElement.querySelector('.field-error');
  if (prevErr) prevErr.remove();
  if (!income || income <= 0) {
    incomeInput.style.borderColor = 'rgba(255,80,80,0.6)';
    const errSpan = document.createElement('span');
    errSpan.className = 'field-error';
    errSpan.style.cssText = 'display:block;font-size:11px;color:rgba(255,80,80,0.8);margin-top:4px;font-weight:500;';
    errSpan.textContent = 'Enter your monthly income to check eligibility';
    incomeInput.parentElement.appendChild(errSpan);
    incomeInput.focus();
    // Shake animation
    incomeInput.style.animation = 'none';
    incomeInput.offsetHeight; // trigger reflow
    incomeInput.style.animation = 'shake 0.4s ease';
    return;
  }
  incomeInput.style.borderColor = '';
  const debt = parseFloat((debtInput?.value || '0').replace(/[^0-9.]/g, '')) || 0;
  const isNational = _mortState.data.residency === 'uae_national';
  const maxMonthly = (income * 0.50) - debt;
  if (maxMonthly <= 0) {
    document.getElementById('mort-max-loan').textContent = 'AED 0';
    document.getElementById('mort-max-monthly').textContent = 'Your existing debt exceeds the 50% debt burden limit.';
    document.getElementById('mort-elig-result').style.display = 'block';
    return;
  }
  // Stress rate: live 3-month EIBOR + 0.5% margin (falls back to 4.18% if not yet loaded)
  const stressRate = _eiborRate ? (_eiborRate.rate + 0.5) / 100 : 0.0418;
  const mr = stressRate / 12;
  const np = 25 * 12;
  const maxLoan = maxMonthly * (Math.pow(1 + mr, np) - 1) / (mr * Math.pow(1 + mr, np));
  _mortState.data.maxLoan = maxLoan;
  _mortState.data.maxMonthly = maxMonthly;
  _mortState.data.income = income;
  _mortState.data.debt = debt;
  document.getElementById('mort-max-loan').textContent = fmtAEDMort(maxLoan);
  document.getElementById('mort-max-monthly').textContent = `Max monthly payment: ${fmtAEDMort(maxMonthly)} · Based on ${isNational ? '85%' : '80%'} LTV`;
  document.getElementById('mort-elig-result').style.display = 'block';
  // Hide the check button, show lead capture
  const checkBtn = document.getElementById('mort-check-btn');
  if (checkBtn) checkBtn.style.display = 'none';
  document.getElementById('mort-lead-capture').style.display = 'block';
  // Focus name field after short delay for smooth UX
  setTimeout(() => { const n = document.getElementById('mort-lead-name'); if (n) n.focus(); }, 300);
  logEvent('mortgage_eligibility_check', { max_loan: Math.round(maxLoan), income: Math.round(income) });
};

// Lead capture after eligibility — captures name + phone before showing rates
window.mortCaptureAndProceed = async function() {
  const nameInput = document.getElementById('mort-lead-name');
  const phoneInput = document.getElementById('mort-lead-phone');
  const errEl = document.getElementById('mort-lead-error');
  const name = (nameInput?.value || '').trim();
  const rawPhone = (phoneInput?.value || '').trim().replace(/[^0-9]/g, '') || '';
  if (!name) {
    if (errEl) { errEl.textContent = 'Enter your name'; errEl.style.display = 'block'; }
    if (nameInput) { nameInput.focus(); nameInput.style.animation = 'none'; nameInput.offsetHeight; nameInput.style.animation = 'shake 0.4s ease'; }
    return;
  }
  if (!rawPhone || rawPhone.length < 7) {
    if (errEl) { errEl.textContent = 'Enter a valid phone number'; errEl.style.display = 'block'; }
    if (phoneInput) { phoneInput.focus(); phoneInput.style.animation = 'none'; phoneInput.offsetHeight; phoneInput.style.animation = 'shake 0.4s ease'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  // Format phone with +971
  const phone = '+971' + rawPhone;
  _mortState.data.leadName = name;
  _mortState.data.leadPhone = phone;
  // Pre-fill Step 3 fields
  const step3Name = document.getElementById('mort-name');
  const step3Phone = document.getElementById('mort-phone');
  if (step3Name && !step3Name.value) step3Name.value = name;
  if (step3Phone && !step3Phone.value) step3Phone.value = rawPhone;
  // Fire-and-forget: capture as a lead for the agent immediately
  try {
    const agentId = currentAgent?.id;
    const propTitle = window._currentProperty?.title || null;
    fetch(SUPABASE_URL + '/functions/v1/capture-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId, name: name, phone: phone,
        source: 'mortgage_calculator', message: 'Mortgage pre-qualification — Max loan: ' + fmtAEDMort(_mortState.data.maxLoan || 0) + (propTitle ? ' — Property: ' + propTitle : ''),
        property_title: propTitle
      })
    }).catch((err) => { console.error('[mortgage] lead capture fetch failed:', err); });
  } catch (e) { console.error('[mortgage] lead capture failed:', e); }
  logEvent('mortgage_lead_captured', { agent: currentAgent?.slug, name: name });
  mortGoStep(2);
};

window.mortSubmitApplication = async function() {
  const name = document.getElementById('mort-name')?.value?.trim();
  const rawPhone = document.getElementById('mort-phone')?.value?.trim().replace(/[^0-9]/g, '') || '';
  const phone = rawPhone ? '+971' + rawPhone : (_mortState.data.leadPhone || null);
  const email = document.getElementById('mort-email')?.value?.trim();
  const errEl = document.getElementById('mort-submit-error');
  const btn = document.getElementById('mort-submit-btn');
  if (!name || (!phone && !email)) {
    if (errEl) { errEl.textContent = 'Name and at least phone or email required.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  const propVal = parseFloat((document.getElementById('mort-value')?.value || '0').replace(/[^0-9.]/g, '')) || null;
  const dpPct = document.getElementById('mort-dp-slider') ? parseInt(document.getElementById('mort-dp-slider').value) : 20;
  const payload = {
    buyer_name: name, buyer_phone: phone || null, buyer_email: email || null,
    monthly_income: _mortState.data.income || null, employment_type: _mortState.data.employment || null,
    residency_status: _mortState.data.residency || null, existing_debt_monthly: _mortState.data.debt || 0,
    property_value: propVal, down_payment_pct: dpPct, preferred_term_years: _mortState.term,
    preferred_rate_type: _mortState.rate + '%', max_loan_amount: _mortState.data.maxLoan || null,
    estimated_monthly: _mortState.data.maxMonthly || null,
    agent_id: currentAgent?.id || null, agent_slug: currentAgent?.slug || null,
    property_id: window._currentProperty?.id || null, property_title: window._currentProperty?.title || null,
    assigned_bank: _mortState.data.selectedBank || null, source: 'profile_page', status: 'new'
  };
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/submit-mortgage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      _mortState.appId = data?.id || null;
      _mortState.editToken = data?.edit_token || null;
      mortGoStep(4);
      injectMortgageSuccessCta(payload);
      logEvent('mortgage_application_submitted', { agent: currentAgent?.slug, bank: payload.assigned_bank });
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed');
    }
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Something went wrong. Please try again.'; errEl.style.display = 'block'; }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Get My Pre-Approval'; }
};

function injectMortgageSuccessCta(payload) {
  const step4 = document.getElementById('mort-step-4');
  if (!step4) return;
  // Remove previous injection if exists
  const prev = document.getElementById('mort-success-inject');
  if (prev) prev.remove();
  // Build a pre-qualification summary card
  const summaryParts = [];
  if (payload.property_value) summaryParts.push('Property: ' + fmtAEDMort(payload.property_value));
  if (payload.max_loan_amount) summaryParts.push('Max loan: ' + fmtAEDMort(payload.max_loan_amount));
  if (payload.estimated_monthly) summaryParts.push('Max monthly: ' + fmtAEDMort(payload.estimated_monthly));
  if (payload.preferred_rate_type) summaryParts.push('Rate: ' + payload.preferred_rate_type);
  if (payload.assigned_bank) summaryParts.push('Bank: ' + payload.assigned_bank);

  // Inject summary + broker reassurance before the Done button
  const doneBtn = step4.querySelector('.modal-btn:last-child');
  const injectEl = document.createElement('div');
  injectEl.id = 'mort-success-inject';

  let html = '';
  // Pre-qualification summary
  if (summaryParts.length > 0) {
    html += `<div style="background:rgba(77,101,255,0.06);border:1px solid rgba(77,101,255,0.12);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:10px;color:rgba(77,101,255,0.7);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Your Pre-Qualification Summary</div>
      ${summaryParts.map(s => `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.4);font-weight:300;">${escHtml(s.split(': ')[0])}</span><span style="font-size:12px;color:#fff;font-weight:600;">${escHtml(s.split(': ')[1] || '')}</span></div>`).join('')}
    </div>`;
  }

  // Broker reassurance
  html += `<div style="display:flex;align-items:center;gap:10px;background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.12);border-radius:10px;padding:14px 16px;margin-bottom:12px;">
    <div style="width:32px;height:32px;border-radius:50%;background:rgba(37,211,102,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    </div>
    <div>
      <span style="font-size:12px;color:#fff;font-weight:600;display:block;margin-bottom:2px;">A licensed broker will WhatsApp you</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:300;">Typically within 2 hours during business hours</span>
    </div>
  </div>`;

  // Amortization bar — only if we have calculated values stored in _mortState.data
  const loanAmt    = _mortState.data.loanAmt        || 0;
  const totalInt   = _mortState.data.totalInterest   || 0;
  const totalPaid  = loanAmt + totalInt;
  if (totalPaid > 0) {
    const principalPct = Math.round((loanAmt   / totalPaid) * 100);
    const interestPct  = 100 - principalPct;
    html += `<div style="margin-bottom:16px;">
    <div style="font-size:10px;color:rgba(255,255,255,0.35);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Loan Cost Breakdown</div>
    <div class="mort-amort-bar" style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:8px;">
      <div class="mort-amort-principal" style="width:${principalPct}%;background:#1127D2;"></div>
      <div class="mort-amort-interest"  style="width:${interestPct}%;background:rgba(255,80,80,0.5);"></div>
    </div>
    <div class="mort-amort-labels" style="display:flex;justify-content:space-between;">
      <span style="font-size:11px;color:rgba(255,255,255,0.45);">Principal: <strong style="color:#fff;">${fmtAEDMort(loanAmt)}</strong></span>
      <span style="font-size:11px;color:rgba(255,255,255,0.45);">Total interest: <strong style="color:rgba(255,120,120,0.85);">${fmtAEDMort(totalInt)}</strong></span>
    </div>
  </div>`;
  }

  injectEl.innerHTML = html;
  if (doneBtn) step4.insertBefore(injectEl, doneBtn);
}

window.mortDocUploaded = async function(input, docType) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('mort-doc-' + docType + '-status');
  const row = input.closest('.mort-upload-row');
  // File validation
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (!ALLOWED_TYPES.includes(file.type)) {
    if (statusEl) statusEl.textContent = 'Only PDF, JPG, PNG allowed';
    return;
  }
  if (file.size > MAX_SIZE) {
    if (statusEl) statusEl.textContent = 'File too large (max 10MB)';
    return;
  }
  if (statusEl) statusEl.textContent = 'Uploading...';
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const path = `${_mortState.appId || 'pending'}/${docType}_${Date.now()}.${ext}`;
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/mortgage-docs/' + path, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file
    });
    if (res.ok) {
      if (statusEl) statusEl.textContent = file.name;
      if (row) row.classList.add('uploaded');
      const checkEl = document.getElementById('mort-doc-' + docType + '-check');
      if (checkEl) checkEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
      if (_mortState.appId && _mortState.editToken) {
        await fetch(SUPABASE_URL + '/functions/v1/update-mortgage-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ id: _mortState.appId, edit_token: _mortState.editToken, doc_type: docType, path })
        });
      }
      logEvent('mortgage_doc_uploaded', { type: docType });
    } else { if (statusEl) statusEl.textContent = 'Upload failed — tap to retry'; }
  } catch (e) { if (statusEl) statusEl.textContent = 'Upload failed — tap to retry'; }
};
