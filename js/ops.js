// @ts-check
// js/ops.js
// Lazy-loaded by ops.html after OPS_SECRET validation.
// Renders metric cards, SVG line chart, and funnel table.

function fmtAED(n) {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `AED ${Math.round(n / 1_000)}K`;
  return `AED ${Math.round(n).toLocaleString()}`;
}

function fmtNum(n) {
  return n?.toLocaleString() ?? '—';
}

function renderCards(data) {
  const momLabel = data.mom_growth_pct !== null
    ? `${data.mom_growth_pct >= 0 ? '+' : ''}${data.mom_growth_pct}% vs last month`
    : 'No prior month data';

  const cards = [
    { label: 'MRR', value: fmtAED(data.mrr), sub: `ARR ${fmtAED(data.arr)}` },
    { label: 'New Agents (MoM)', value: fmtNum(data.funnel.joined), sub: momLabel },
    { label: 'Paid Agents', value: fmtNum(data.funnel.paid), sub: `Pro + Premium` },
    { label: 'Activation Rate', value: `${data.activation_rate_pct}%`, sub: 'Agents with ≥1 listing' },
    { label: 'Leads (30d)', value: fmtNum(data.total_leads_30d), sub: 'All agents combined' },
    { label: 'Churn (30d)', value: fmtNum(data.churn_30d), sub: 'Cancellations this month' },
    { label: 'Free', value: fmtNum(data.tier_breakdown.free ?? 0), sub: 'Free tier agents' },
    { label: 'Pro', value: fmtNum(data.tier_breakdown.pro ?? 0), sub: 'AED 299/mo' },
    { label: 'Premium', value: fmtNum(data.tier_breakdown.premium ?? 0), sub: 'AED 799/mo' },
  ];

  const container = document.getElementById('metrics-cards');
  if (!container) return;
  container.innerHTML = cards.map(c => `
    <div class="metric-card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
    </div>
  `).join('');
}

function renderChart(series) {
  const svg = document.getElementById('lead-chart');
  if (!svg || !series?.length) return;

  const W = 700, H = 120, PAD = 10;
  const maxCount = Math.max(...series.map(d => d.count), 1);
  const xStep = (W - PAD * 2) / (series.length - 1);

  const points = series.map((d, i) => {
    const x = PAD + i * xStep;
    const y = PAD + (1 - d.count / maxCount) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Fill polygon (line + bottom close)
  const first = points.split(' ')[0];
  const last = points.split(' ').at(-1);
  const fillPoints = `${points} ${last?.split(',')[0]},${H} ${first?.split(',')[0]},${H}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="lead-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${fillPoints}" fill="url(#lead-grad)"/>
    <polyline points="${points}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  `;
}

function renderFunnel(funnel) {
  const section = document.getElementById('funnel-section');
  if (!section) return;

  const steps = [
    { label: 'Joined', count: funnel.joined },
    { label: 'Verified', count: funnel.verified },
    { label: 'Listed First Property', count: funnel.with_property },
    { label: 'Received First Lead', count: funnel.with_lead },
    { label: 'Converted to Paid', count: funnel.paid },
  ];

  const maxCount = funnel.joined || 1;

  section.innerHTML = `
    <h2>Agent Funnel</h2>
    ${steps.map(s => `
      <div class="funnel-row">
        <span class="step">${s.label}</span>
        <span class="count">${fmtNum(s.count)}</span>
      </div>
      <div class="funnel-bar">
        <div class="funnel-bar-fill" style="width:${Math.round((s.count / maxCount) * 100)}%"></div>
      </div>
    `).join('')}
  `;
}

let _refreshTimer = null;

async function refresh(key, functionsUrl) {
  try {
    const res = await fetch(`${functionsUrl}/get-metrics`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderCards(data);
    renderChart(data.lead_series);
    renderFunnel(data.funnel);
    // Remove stale badge if present
    document.querySelectorAll('.badge-stale').forEach(el => el.remove());
  } catch (err) {
    console.warn('Metrics refresh failed, showing stale data:', err);
    // Add stale badge to first card value
    const firstValue = document.querySelector('.metric-card .value');
    if (firstValue && !firstValue.querySelector('.badge-stale')) {
      firstValue.insertAdjacentHTML('beforeend', '<span class="badge-stale">stale</span>');
    }
  }
}

export default function renderOps(initialData, key, functionsUrl) {
  renderCards(initialData);
  renderChart(initialData.lead_series);
  renderFunnel(initialData.funnel);

  // Auto-refresh every 5 minutes
  _refreshTimer = setInterval(() => refresh(key, functionsUrl), 5 * 60 * 1000);
}
