// ==========================================
// MORTGAGE FLOW (Multi-step)
// ==========================================

import type { Database } from '../types/supabase';
import { logEvent } from './analytics';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { currentAgent } from './state';
import { escAttr, escHtml } from './utils';

type MortgageRate = Database['public']['Tables']['mortgage_rates']['Row'];

interface EiborRate { rate: number; spread: number; }

interface OffPlanMilestone { trigger: string; percentage?: number; }
interface OffPlanProject { name?: string; minPrice?: number; milestones?: OffPlanMilestone[]; completionDate?: string; }

interface MortStateData {
  employment: string;
  residency: string;
  income?: number;
  debt?: number;
  maxLoan?: number;
  maxMonthly?: number;
  loanAmt?: number;
  monthlyPayment?: number;
  totalInterest?: number;
  selectedBank?: string;
  leadName?: string;
  leadPhone?: string;
  _opIncludeAgent?: boolean;
  _opAgentComm?: number;
  _opBookingAmt?: number;
  _opDldFee?: number;
  _opTotalCash?: number;
  _opLoanAmount?: number;
  [key: string]: string | number | boolean | undefined;
}

interface MortState {
  mode: string;
  step: number;
  term: number;
  rate: number;
  appId: string | null;
  editToken: string | null;
  project: OffPlanProject | null;
  data: MortStateData;
  rates: MortgageRate[];
}

interface MortPayload {
  buyer_name?: string;
  buyer_phone?: string | null;
  buyer_email?: string | null;
  monthly_income?: number | null;
  employment_type?: string | null;
  residency_status?: string | null;
  existing_debt_monthly?: number;
  property_value?: number | null;
  down_payment_pct?: number;
  preferred_term_years?: number;
  preferred_rate_type?: string;
  max_loan_amount?: number | null;
  estimated_monthly?: number | null;
  agent_id?: string | null;
  agent_slug?: string | null;
  property_id?: string | null;
  property_title?: string | null;
  assigned_bank?: string | null;
  source?: string;
  status?: string;
}

const _mortStateDefaults: MortState = {
  mode:      'standard',
  step:      1,
  term:      25,
  rate:      3.99,
  appId:     null,
  editToken: null,
  project:   null,
  data: {
    employment: 'salaried',
    residency:  'uae_resident',
  },
  rates:     [],
};

let _mortState: MortState = { ..._mortStateDefaults, data: { ..._mortStateDefaults.data } };

// _eiborRate stays separate — it's cached external data, not per-session state
let _eiborRate: EiborRate | null = null;

const fmtAEDMort = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

window.openMortgage = () => {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  // Reset to standard mode on direct open
  _mortState = { ..._mortStateDefaults, data: { ..._mortStateDefaults.data } };
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  window.mortGoStep!(1);
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
      const valInput = document.getElementById('mort-value') as HTMLInputElement | null;
      if (valInput) valInput.value = Math.round(priceNum).toLocaleString('en-US');
      const dpSlider = document.getElementById('mort-dp-slider') as HTMLInputElement | null;
      if (dpSlider) {
        const minDp = _mortState.data.residency === 'uae_national' ? 15 : (_mortState.data.residency === 'non_resident' ? 50 : 20);
        dpSlider.min = String(minDp);
        dpSlider.value = String(minDp);
        const dpPctEl = document.getElementById('mort-dp-pct');
        if (dpPctEl) dpPctEl.textContent = `${minDp}%`;
        const minLabel = dpSlider.parentElement?.querySelector('span');
        if (minLabel) minLabel.textContent = `${minDp}%`;
      }
    }
  }
  logEvent('mortgage_calc_open', { property: window._currentProperty?.title || null });
};

window.initMortModal = (opts: Partial<MortState> = {}) => {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  // Merge opts over defaults; deep-clone data to avoid mutation
  _mortState = {
    ..._mortStateDefaults,
    ...opts,
    data: { ..._mortStateDefaults.data, ...(opts.data || {}) },
  } as MortState;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  window.mortGoStep!(1);
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

window.closeMortgage = () => {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
};


window._mortOpToggleAgent = (checked) => {
  _mortState.data._opIncludeAgent = checked;
  const agentAmtEl = document.getElementById('mort-op-agent-amt');
  const cashEl     = document.getElementById('mort-op-cash');
  const agentComm  = (_mortState.data._opAgentComm as number | undefined) ?? 0;
  const base       = ((_mortState.data._opBookingAmt as number | undefined) ?? 0) + ((_mortState.data._opDldFee as number | undefined) ?? 0);
  const newCash    = checked ? base + agentComm : base;
  _mortState.data._opTotalCash = newCash;
  if (agentAmtEl) agentAmtEl.textContent = checked ? `AED ${Math.round(agentComm).toLocaleString()}` : 'AED 0';
  if (cashEl)     cashEl.textContent     = `AED ${Math.round(newCash).toLocaleString()}`;
};

window.mortOpProceed = () => {
  // Pre-fill the property value in step 2 with the loan amount
  const valInput = document.getElementById('mort-value') as HTMLInputElement | null;
  if (valInput && _mortState.data._opLoanAmount) {
    valInput.value = Math.round(_mortState.data._opLoanAmount as number).toLocaleString('en-US');
  }
  window.mortGoStep!(2);
};

window.mortGoStep = (step) => {
  _mortState.step = step;
  document.querySelectorAll('.mort-step').forEach(s => (s as HTMLElement).style.display = 'none');
  const el = document.getElementById(`mort-step-${step}`);
  if (el) el.style.display = 'block';
  // Off-plan mode: replace step 1 content with milestone breakdown
  if (step === 1 && _mortState.mode === 'offplan') {
    import('./mortgage-offplan.js').then(({ renderOffPlanBreakdown }) => {
      if (!_mortState.project) return;
      const result = renderOffPlanBreakdown(_mortState.project);
      _mortState.data._opBookingAmt   = result.bookingAmt;
      _mortState.data._opDldFee       = result.dldFee;
      _mortState.data._opAgentComm    = result.agentComm;
      _mortState.data._opLoanAmount   = result.loanAmount;
      _mortState.data._opTotalCash    = result.totalCash;
      _mortState.data._opIncludeAgent = true;
      const step1El = document.getElementById('mort-step-1');
      if (step1El) step1El.innerHTML = result.html;
    });
  }
  // Scroll modal back to top on every step change
  const modal = document.querySelector('#mortgage-modal .modal');
  if (modal) (modal as HTMLElement).scrollTop = 0;
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
    const dpSlider = document.getElementById('mort-dp-slider') as HTMLInputElement | null;
    if (dpSlider) {
      const minDp = _mortState.data.residency === 'uae_national' ? 15 : (_mortState.data.residency === 'non_resident' ? 50 : 20);
      dpSlider.min = String(minDp);
      if (parseInt(dpSlider.value, 10) < minDp) dpSlider.value = String(minDp);
      const dpPctEl = document.getElementById('mort-dp-pct');
      if (dpPctEl) dpPctEl.textContent = `${dpSlider.value}%`;
    }
    renderBankCards();
    renderEiborBadge();
    // Auto-calculate if property value is pre-filled
    const valInput = document.getElementById('mort-value') as HTMLInputElement | null;
    if (valInput?.value) window.calcMortgage!();
  }
};

window.setMortField = (btn, field, value) => {
  _mortState.data[field] = value as string | number | boolean;
  btn.parentElement?.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.setMortTerm = (btn, years) => {
  _mortState.term = years;
  btn.parentElement?.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBankCards();
  window.calcMortgage!();
};

let _mortRatesLoadFailed = false;
const MORT_RATES_TTL_MS = 30 * 60 * 1000; // 30 minutes
let _cachedMortRates: MortgageRate[] | null = null;
let _mortRatesFetchedAt = 0;

async function loadMortgageRates() {
  const now = Date.now();
  if (_cachedMortRates && now - _mortRatesFetchedAt < MORT_RATES_TTL_MS) {
    _mortState.rates = [..._cachedMortRates!];
    renderBankCards();
    return;
  }
  if (_mortRatesLoadFailed && now - _mortRatesFetchedAt < MORT_RATES_TTL_MS) {
    renderBankCards();
    return;
  }
  // TTL expired — reset state and re-fetch
  _cachedMortRates = null;
  _mortRatesLoadFailed = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/mortgage_rates?is_active=eq.true&order=rate_pct.asc`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (res.ok) {
      _cachedMortRates = await res.json() as MortgageRate[];
      _mortState.rates = _cachedMortRates;
      _mortRatesFetchedAt = Date.now();
    } else {
      console.error('[mortgage] rates fetch failed:', res.status);
      _mortRatesLoadFailed = true;
      _mortRatesFetchedAt = Date.now();
    }
  } catch (e) {
    console.error('Failed to load mortgage rates:', e);
    _mortRatesLoadFailed = true;
    _mortRatesFetchedAt = Date.now();
  }
  renderBankCards();
}

async function loadEiborRate() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-eibor`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) { console.warn('[eibor] fetch returned', res.status, '— using fallback rate'); return; }
    const data = await res.json() as { rate: number };
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

function filterRatesForProfile(rates: MortgageRate[]): MortgageRate[] {
  const income = _mortState.data.income ?? 0;
  const residency = _mortState.data.residency || 'uae_resident';
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
  const typeLabels: Record<string, string> = { fixed_1yr: '1yr Fixed', fixed_3yr: '3yr Fixed', fixed_5yr: '5yr Fixed', variable: 'Variable', islamic_fixed: 'Islamic Fixed', islamic_variable: 'Islamic Variable' };
  const best: MortgageRate[] = [];
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

  const valInput = document.getElementById('mort-value') as HTMLInputElement | null;
  const dpSlider = document.getElementById('mort-dp-slider') as HTMLInputElement | null;
  const propVal = valInput ? parseFloat(valInput.value.replace(/[^0-9.]/g, '')) || 0 : 0;
  const dpPct = dpSlider ? parseInt(dpSlider.value, 10) / 100 : 0.2;
  const loanAmt = propVal * (1 - dpPct);

  // Rate freshness indicator
  const latestUpdate = allRates.reduce((latest, r) => {
    const d = r.last_updated || r.created_at;
    return (d && d > latest) ? d : latest;
  }, '');
  const freshLabel = latestUpdate ? new Date(latestUpdate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';

  let html = '';

  // "Matched to you" badge if we have profile data
  if ((_mortState.data.income ?? 0) > 0) {
    const residencyLabel: Record<string, string> = { uae_national: 'UAE National', uae_resident: 'Resident', non_resident: 'Non-Resident' };
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:10px;color:rgba(77,101,255,0.8);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Matched to your profile</span>
      <span style="font-size:9px;color:rgba(255,255,255,0.2);font-weight:300;">${residencyLabel[_mortState.data.residency] || ''} · ${_mortState.data.employment === 'salaried' ? 'Salaried' : _mortState.data.employment === 'self_employed' ? 'Self-Employed' : 'Business Owner'}</span>
    </div>`;
  }

  // Bank brand colors for logo badges
  const bankColors: Record<string, string> = {
    'Standard Chartered': '#0072AA', 'HSBC': '#DB0011', 'Emirates NBD': '#F26522',
    'Emirates Islamic': '#00843D', 'Dubai Islamic Bank': '#00543C', 'ADCB': '#B8860B',
    'ADIB': '#6B2D73', 'FAB': '#004B87', 'Mashreq': '#E31937', 'RAK Bank': '#C8102E'
  };
  const bankAbbrev: Record<string, string> = {
    'Standard Chartered': 'SC', 'HSBC': 'HS', 'Emirates NBD': 'EN',
    'Emirates Islamic': 'EI', 'Dubai Islamic Bank': 'DIB', 'ADCB': 'AD',
    'ADIB': 'AB', 'FAB': 'FA', 'Mashreq': 'MQ', 'RAK Bank': 'RK'
  };

  html += best.map((r, i) => {
    let monthlyStr = '';
    if (loanAmt > 0) {
      const mr = (r.rate_pct / 100) / 12;
      const np = _mortState.term * 12;
      const mp = loanAmt * (mr * (1 + mr) ** np) / ((1 + mr) ** np - 1);
      monthlyStr = `${fmtAEDMort(mp)}/mo`;
    }
    const bestTag = i === 0 ? '<span style="font-size:8px;background:rgba(37,211,102,0.15);color:#25d366;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:6px;">BEST RATE</span>' : '';
    const bgColor = bankColors[r.bank_name] || '#4d65ff';
    const abbrev = bankAbbrev[r.bank_name] || r.bank_name.slice(0, 2).toUpperCase();
    const logoBadge = `<div style="width:28px;height:28px;border-radius:6px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:10px;"><span style="font-size:9px;font-weight:800;color:#fff;letter-spacing:-0.3px;">${abbrev}</span></div>`;
    return `<div class="mort-bank-card${i === 0 ? ' active' : ''}" data-action="selectBankRate" data-rate="${r.rate_pct}" data-bank="${escAttr(r.bank_name)}" style="display:flex;align-items:center;">
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
  if (best.length > 0) _mortState.rate = best[0]!.rate_pct;
}

window.selectBankRate = (card, rate, bankName) => {
  _mortState.rate = rate;
  _mortState.data.selectedBank = bankName;
  card.parentElement?.querySelectorAll('.mort-bank-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  window.calcMortgage!();
};

window.calcMortgage = () => {
  const valInput = document.getElementById('mort-value') as HTMLInputElement | null;
  const dpSlider = document.getElementById('mort-dp-slider') as HTMLInputElement | null;
  const dpPctEl = document.getElementById('mort-dp-pct');
  const resultsEl = document.getElementById('mort-results');
  if (!valInput || !dpSlider) return;
  const rawVal = parseFloat(valInput.value.replace(/[^0-9.]/g, ''));
  const dpPct = parseInt(dpSlider.value, 10) / 100;
  if (dpPctEl) dpPctEl.textContent = `${dpSlider.value}%`;
  if (!rawVal || rawVal <= 0) { if (resultsEl) resultsEl.style.display = 'none'; renderBankCards(); return; }
  const loanAmt = rawVal * (1 - dpPct);
  const monthlyRate = (_mortState.rate / 100) / 12;
  const numPayments = _mortState.term * 12;
  let monthlyPayment;
  if (numPayments === 0) {
    monthlyPayment = 0;
  } else if (monthlyRate === 0) {
    monthlyPayment = loanAmt / numPayments;
  } else {
    const factor = (1 + monthlyRate) ** numPayments;
    monthlyPayment = loanAmt * (monthlyRate * factor) / (factor - 1);
  }
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

window.mortCheckEligibility = () => {
  const incomeInput = document.getElementById('mort-income') as HTMLInputElement | null;
  const debtInput = document.getElementById('mort-debt') as HTMLInputElement | null;
  if (!incomeInput) return;
  const income = parseFloat(incomeInput.value.replace(/[^0-9.]/g, ''));
  // Clear any previous error
  const prevErr = incomeInput.parentElement?.querySelector('.field-error');
  if (prevErr) prevErr.remove();
  if (!income || income <= 0) {
    incomeInput.style.borderColor = 'rgba(255,80,80,0.6)';
    const errSpan = document.createElement('span');
    errSpan.className = 'field-error';
    errSpan.style.cssText = 'display:block;font-size:11px;color:rgba(255,80,80,0.8);margin-top:4px;font-weight:500;';
    errSpan.textContent = 'Enter your monthly income to check eligibility';
    incomeInput.parentElement?.appendChild(errSpan);
    incomeInput.focus();
    // Shake animation
    incomeInput.style.animation = 'none';
    void incomeInput.offsetHeight; // trigger reflow
    incomeInput.style.animation = 'shake 0.4s ease';
    return;
  }
  incomeInput.style.borderColor = '';
  const debt = parseFloat((debtInput?.value || '0').replace(/[^0-9.]/g, '')) || 0;
  const isNational = _mortState.data.residency === 'uae_national';
  const maxMonthly = (income * 0.50) - debt;
  if (maxMonthly <= 0) {
    const maxLoanEl = document.getElementById('mort-max-loan');
    if (maxLoanEl) maxLoanEl.textContent = 'AED 0';
    const maxMonthlyEl = document.getElementById('mort-max-monthly');
    if (maxMonthlyEl) maxMonthlyEl.textContent = 'Your existing debt exceeds the 50% debt burden limit.';
    const eligResult = document.getElementById('mort-elig-result');
    if (eligResult) eligResult.style.display = 'block';
    return;
  }
  // Stress rate: live 3-month EIBOR + 0.5% margin (falls back to 4.18% if not yet loaded)
  const stressRate = _eiborRate ? (_eiborRate.rate + 0.5) / 100 : 0.0418;
  const mr = stressRate / 12;
  const np = 25 * 12;
  const maxLoan = maxMonthly * ((1 + mr) ** np - 1) / (mr * (1 + mr) ** np);
  _mortState.data.maxLoan = maxLoan;
  _mortState.data.maxMonthly = maxMonthly;
  _mortState.data.income = income;
  _mortState.data.debt = debt;
  const maxLoanEl = document.getElementById('mort-max-loan');
  if (maxLoanEl) maxLoanEl.textContent = fmtAEDMort(maxLoan);
  const maxMonthlyEl = document.getElementById('mort-max-monthly');
  if (maxMonthlyEl) maxMonthlyEl.textContent = `Max monthly payment: ${fmtAEDMort(maxMonthly)} · Based on ${isNational ? '85%' : '80%'} LTV`;
  const eligResult = document.getElementById('mort-elig-result');
  if (eligResult) eligResult.style.display = 'block';
  // Hide the check button, show lead capture
  const checkBtn = document.getElementById('mort-check-btn');
  if (checkBtn) checkBtn.style.display = 'none';
  const leadCapture = document.getElementById('mort-lead-capture');
  if (leadCapture) leadCapture.style.display = 'block';
  // Focus name field after short delay for smooth UX
  setTimeout(() => { const n = document.getElementById('mort-lead-name'); if (n) n.focus(); }, 300);
  logEvent('mortgage_eligibility_check', { max_loan: Math.round(maxLoan), income: Math.round(income) });
};

// Lead capture after eligibility — captures name + phone before showing rates
window.mortCaptureAndProceed = async () => {
  const nameInput = document.getElementById('mort-lead-name') as HTMLInputElement | null;
  const phoneInput = document.getElementById('mort-lead-phone') as HTMLInputElement | null;
  const errEl = document.getElementById('mort-lead-error');
  const name = (nameInput?.value || '').trim();
  const rawPhone = (phoneInput?.value || '').trim().replace(/[^0-9]/g, '') || '';
  if (!name) {
    if (errEl) { errEl.textContent = 'Enter your name'; (errEl as HTMLElement).style.display = 'block'; }
    if (nameInput) { nameInput.focus(); nameInput.style.animation = 'none'; void nameInput.offsetHeight; nameInput.style.animation = 'shake 0.4s ease'; }
    return;
  }
  if (!rawPhone || rawPhone.length < 7) {
    if (errEl) { errEl.textContent = 'Enter a valid phone number'; (errEl as HTMLElement).style.display = 'block'; }
    if (phoneInput) { phoneInput.focus(); phoneInput.style.animation = 'none'; void phoneInput.offsetHeight; phoneInput.style.animation = 'shake 0.4s ease'; }
    return;
  }
  if (errEl) (errEl as HTMLElement).style.display = 'none';
  // Format phone with +971
  const phone = `+971${rawPhone}`;
  _mortState.data.leadName = name;
  _mortState.data.leadPhone = phone;
  // Pre-fill Step 3 fields
  const step3Name = document.getElementById('mort-name') as HTMLInputElement | null;
  const step3Phone = document.getElementById('mort-phone') as HTMLInputElement | null;
  if (step3Name && !step3Name.value) step3Name.value = name;
  if (step3Phone && !step3Phone.value) step3Phone.value = rawPhone;
  // Fire-and-forget: capture as a lead for the agent immediately
  try {
    const agentSlug = currentAgent?.slug;
    const propTitle = window._currentProperty?.title || null;
    fetch(`${SUPABASE_URL}/functions/v1/capture-lead-v4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_slug: agentSlug, name: name, phone: phone,
        source: 'mortgage_calculator', message: `Mortgage pre-qualification — Max loan: ${fmtAEDMort(_mortState.data.maxLoan ?? 0)}${propTitle ? ` — Property: ${propTitle}` : ''}`,
        property_title: propTitle
      })
    }).catch((err) => { console.error('[mortgage] lead capture fetch failed:', err); });
  } catch (e) { console.error('[mortgage] lead capture failed:', e); }
  logEvent('mortgage_lead_captured', { agent: currentAgent?.slug, name: name });
  window.mortGoStep!(2);
};

window.mortSubmitApplication = async () => {
  const name = (document.getElementById('mort-name') as HTMLInputElement | null)?.value?.trim();
  const rawPhone = (document.getElementById('mort-phone') as HTMLInputElement | null)?.value?.trim().replace(/[^0-9]/g, '') || '';
  const phone = rawPhone ? `+971${rawPhone}` : (_mortState.data.leadPhone as string | undefined ?? null);
  const email = (document.getElementById('mort-email') as HTMLInputElement | null)?.value?.trim();
  const errEl = document.getElementById('mort-submit-error');
  const btn = document.getElementById('mort-submit-btn') as HTMLButtonElement | null;
  if (!name || (!phone && !email)) {
    if (errEl) { errEl.textContent = 'Name and at least phone or email required.'; (errEl as HTMLElement).style.display = 'block'; }
    return;
  }
  if (errEl) (errEl as HTMLElement).style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  const propVal = parseFloat(((document.getElementById('mort-value') as HTMLInputElement | null)?.value || '0').replace(/[^0-9.]/g, '')) || null;
  const dpSliderEl = document.getElementById('mort-dp-slider') as HTMLInputElement | null;
  const dpPct = dpSliderEl ? parseInt(dpSliderEl.value, 10) : 20;
  const payload: MortPayload = {
    buyer_name: name, buyer_phone: phone || null, buyer_email: email || null,
    monthly_income: (_mortState.data.income as number | undefined) ?? null,
    employment_type: _mortState.data.employment || null,
    residency_status: _mortState.data.residency || null,
    existing_debt_monthly: (_mortState.data.debt as number | undefined) ?? 0,
    property_value: propVal, down_payment_pct: dpPct, preferred_term_years: _mortState.term,
    preferred_rate_type: `${_mortState.rate}%`,
    max_loan_amount: (_mortState.data.maxLoan as number | undefined) ?? null,
    estimated_monthly: (_mortState.data.maxMonthly as number | undefined) ?? null,
    agent_id: currentAgent?.id || null, agent_slug: currentAgent?.slug || null,
    property_id: window._currentProperty?.id || null, property_title: window._currentProperty?.title || null,
    assigned_bank: (_mortState.data.selectedBank as string | undefined) ?? null, source: 'profile_page', status: 'new'
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-mortgage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json() as { id?: string; edit_token?: string };
      _mortState.appId = data?.id || null;
      _mortState.editToken = data?.edit_token || null;
      window.mortGoStep!(4);
      // Lazy-load success CTA — only needed after submission (step 4)
      import('./mortgage-success').then(({ injectMortgageSuccessCta }) => {
        injectMortgageSuccessCta(payload, _mortState);
      }).catch(e => console.error('[mortgage-success] load failed:', e));
      logEvent('mortgage_application_submitted', { agent: currentAgent?.slug, bank: payload.assigned_bank });
    } else {
      const errData = await res.json().catch(() => ({} as { error?: string })) as { error?: string };
      throw new Error(errData.error || 'Failed');
    }
  } catch (e) {
    if (errEl) { errEl.textContent = (e instanceof Error ? e.message : null) || 'Something went wrong. Please try again.'; (errEl as HTMLElement).style.display = 'block'; }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Get My Pre-Approval'; }
};

// injectMortgageSuccessCta — extracted to mortgage-success.ts (lazy-loaded on step 4)

window.mortDocUploaded = async (input: HTMLInputElement, docType: string) => {
  const { mortDocUploaded: upload } = await import('./mortgage-success');
  return upload(input, docType, _mortState.appId, _mortState.editToken);
};
