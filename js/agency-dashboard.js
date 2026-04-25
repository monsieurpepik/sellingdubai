// @ts-check
const SUPABASE_URL = window.__SD_SUPABASE_URL__ || 'https://pjyorgedaxevxophpfib.supabase.co';
const MANAGE_URL = `${SUPABASE_URL}/functions/v1/manage-agency`;
const STATS_URL = `${SUPABASE_URL}/functions/v1/agency-stats`;

let _token = null;
let _agency = null;
let _agencyId = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function show(id) {
  ['loading','auth-gate','create-section','dashboard-section'].forEach(s => {
    document.getElementById(s).style.display = 'none';
  });
  document.getElementById(id).style.display = 'block';
}

async function callManage(body) {
  try {
    const res = await fetch(MANAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _token, ...body })
    });
    if (!res.ok && res.status >= 500) return { error: 'Server error. Please try again.' };
    return res.json();
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

async function init() {
  _token = localStorage.getItem('sd_edit_token');
  if (!_token) { show('auth-gate'); return; }

  const data = await callManage({ action: 'get_my_agency' });
  if (data.error) { show('auth-gate'); return; }

  if (!data.agency) {
    show('create-section');
    return;
  }

  _agency = data.agency;
  _agencyId = data.agency.id;
  renderAgencyHeader(data.agency);
  show('dashboard-section');
  loadStats(data.members || []);
}

function renderAgencyHeader(agency) {
  document.getElementById('agency-name-el').textContent = agency.name;
  document.getElementById('agency-slug-el').textContent = `/${agency.slug}`;
  const link = document.getElementById('agency-profile-link');
  link.href = `/agency/${agency.slug}`;
  link.textContent = `sellingdubai.com/agency/${agency.slug}`;
  const logoEl = document.getElementById('agency-logo-el');
  if (agency.logo_url) {
    const logoSrc = agency.logo_url.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? `/.netlify/images?url=${encodeURIComponent(agency.logo_url)}&w=112&fm=webp&q=80`
      : agency.logo_url;
    const img = document.createElement('img');
    img.src = logoSrc;
    img.alt = '';
    logoEl.innerHTML = '';
    logoEl.appendChild(img);
  }
  document.getElementById('edit-name').value = agency.name || '';
  document.getElementById('edit-logo').value = agency.logo_url || '';
  document.getElementById('edit-website').value = agency.website || '';
  document.getElementById('edit-description').value = agency.description || '';
}

async function loadStats(membersFromGet) {
  // Fire both requests in parallel — summary stats and agent breakdown
  const [summaryResult, breakdownResult] = await Promise.allSettled([
    fetch(STATS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _token })
    }).then(r => r.json()),
    fetch(STATS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _token, breakdown: 'agents' })
    }).then(r => r.json()),
  ]);

  // Render summary metrics
  if (summaryResult.status === 'fulfilled' && summaryResult.value.totals) {
    const t = summaryResult.value.totals;
    document.getElementById('m-leads-month').textContent = t.leads_this_month;
    document.getElementById('m-leads-last').textContent = `${t.leads_last_month} last month`;
    document.getElementById('m-views-month').textContent = t.views_this_month;
    document.getElementById('m-views-last').textContent = `${t.views_last_month} last month`;
    document.getElementById('m-wa-month').textContent = t.wa_taps_this_month;
    document.getElementById('m-props').textContent = t.properties_active;
    document.getElementById('m-agents-count').textContent = `${t.agents_count} agents`;
    renderMembersTable(summaryResult.value.agents || []);
  } else {
    renderMembersTable(membersFromGet.map(m => ({ ...m })));
  }

  // Render per-agent breakdown table
  if (breakdownResult.status === 'fulfilled' && Array.isArray(breakdownResult.value.agents_breakdown)) {
    renderTeamPerfTable(breakdownResult.value.agents_breakdown);
  } else {
    // Hide the section if breakdown unavailable
    document.getElementById('team-perf-loading').textContent = 'Performance data unavailable.';
  }
}

function renderMembersTable(agents) {
  const tbody = document.getElementById('members-tbody');
  if (!agents.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:rgba(255,255,255,0.3);padding:24px;text-align:center;">No members yet. Add agents by email below.</td></tr>';
    return;
  }
  tbody.innerHTML = agents.map(a => {
    const initials = (a.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const photoSrc = a.photo_url?.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? `/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=64&fm=webp&q=80`
      : a.photo_url;
    const photoSrcset = a.photo_url?.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? escapeHtml(`/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=80&fm=webp&q=80 80w, /.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=160&fm=webp&q=80 160w`)
      : '';
    const avatar = photoSrc
      ? `<img src="${escapeHtml(photoSrc)}"${photoSrcset ? ` srcset="${photoSrcset}" sizes="80px"` : ''} width="80" height="80" alt="">`
      : escapeHtml(initials);
    const tierBadge = a.tier === 'premium' ? '<span class="badge badge-premium">Premium</span>'
      : a.tier === 'pro' ? '<span class="badge badge-pro">Pro</span>'
      : '<span class="badge badge-free">Free</span>';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="member-avatar">${avatar}</div>
          <div>
            <div class="member-name">${escapeHtml(a.name) || '—'}</div>
            <div class="member-slug"><a href="/${encodeURIComponent(a.slug)}" target="_blank" style="color:rgba(255,255,255,0.4);">@${escapeHtml(a.slug)}</a></div>
          </div>
        </div>
      </td>
      <td>${tierBadge}</td>
      <td class="stat-cell">${escapeHtml(String(a.leads_this_month ?? '—'))}</td>
      <td class="stat-cell">${escapeHtml(String(a.views_this_month ?? '—'))}</td>
      <td class="stat-cell">${escapeHtml(String(a.properties_active ?? '—'))}</td>
      <td><button class="btn btn-danger" style="padding:4px 10px;font-size:12px;" data-member-id="${escapeHtml(a.agent_id || a.id)}" title="Remove from agency">Remove</button></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-member-id]').forEach((btn, i) => {
    btn.addEventListener('click', () => removeMember(agents[i].agent_id || agents[i].id, agents[i].name || ''));
  });
}

window.createAgency = async () => {
  const name = document.getElementById('create-name').value.trim();
  const errEl = document.getElementById('create-error');
  errEl.classList.remove('show');
  if (!name) { errEl.textContent = 'Agency name is required.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-create-agency');
  btn.disabled = true; btn.textContent = 'Creating...';
  const data = await callManage({
    action: 'create', name,
    logo_url: document.getElementById('create-logo').value.trim() || null,
    website: document.getElementById('create-website').value.trim() || null,
    description: document.getElementById('create-description').value.trim() || null,
  });
  btn.disabled = false; btn.textContent = 'Create Agency';
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  _agency = data.agency; _agencyId = data.agency.id;
  renderAgencyHeader(data.agency);
  show('dashboard-section');
  loadStats([]);
};

window.toggleEditPanel = () => {
  const panel = document.getElementById('edit-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

window.saveAgency = async () => {
  const errEl = document.getElementById('edit-error');
  const sucEl = document.getElementById('edit-success');
  errEl.classList.remove('show'); sucEl.classList.remove('show');
  const btn = document.getElementById('btn-save-agency');
  btn.disabled = true; btn.textContent = 'Saving...';
  const data = await callManage({
    action: 'update', agency_id: _agencyId,
    name: document.getElementById('edit-name').value.trim(),
    logo_url: document.getElementById('edit-logo').value.trim() || null,
    website: document.getElementById('edit-website').value.trim() || null,
    description: document.getElementById('edit-description').value.trim() || null,
  });
  btn.disabled = false; btn.textContent = 'Save Changes';
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  _agency = data.agency;
  renderAgencyHeader(data.agency);
  sucEl.textContent = 'Agency updated.'; sucEl.classList.add('show');
  setTimeout(() => sucEl.classList.remove('show'), 3000);
};

window.addMember = async () => {
  const email = document.getElementById('add-member-email').value.trim();
  const errEl = document.getElementById('member-error');
  const sucEl = document.getElementById('member-success');
  errEl.classList.remove('show'); sucEl.classList.remove('show');
  if (!email) { errEl.textContent = 'Enter an agent email.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-add-member');
  btn.disabled = true;
  const data = await callManage({ action: 'add_member', agency_id: _agencyId, member_email: email });
  btn.disabled = false;
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  document.getElementById('add-member-email').value = '';
  sucEl.textContent = `${data.member.name} added to the agency.`; sucEl.classList.add('show');
  setTimeout(() => sucEl.classList.remove('show'), 3000);
  const refreshData = await callManage({ action: 'get_my_agency' });
  if (refreshData.agency) loadStats(refreshData.members || []);
};

window.removeMember = async (memberId, memberName) => {
  if (!confirm(`Remove ${memberName} from the agency?`)) return;
  const errEl = document.getElementById('member-error');
  errEl.classList.remove('show');
  const data = await callManage({ action: 'remove_member', agency_id: _agencyId, member_id: memberId });
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  const refreshData = await callManage({ action: 'get_my_agency' });
  if (refreshData.agency) loadStats(refreshData.members || []);
};

// ── TEAM PERFORMANCE TABLE ──────────────────────────────────────────────────

/** @type {{ col: string, asc: boolean }} */
let _sortState = { col: 'leads_received', asc: false };

/**
 * @param {Array<{agent_id:string,name:string,leads_received:number,leads_contacted:number,response_time_median_hours:number|null,active_listings:number,cobrokes_sent:number,cobrokes_received:number}>} breakdown
 */
function renderTeamPerfTable(breakdown) {
  const section = document.getElementById('team-perf-section');
  const loading = document.getElementById('team-perf-loading');
  const tableWrap = document.getElementById('team-perf-table-wrap');

  if (!breakdown.length) {
    loading.textContent = 'No performance data yet.';
    section.style.display = '';
    return;
  }

  section.style.display = '';
  loading.style.display = 'none';
  tableWrap.style.display = '';

  // Wire up sortable column headers
  document.querySelectorAll('#team-perf-table thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (_sortState.col === col) {
        _sortState.asc = !_sortState.asc;
      } else {
        _sortState.col = col;
        // For response time lower is better, default asc; others default desc
        _sortState.asc = col === 'response_time_median_hours';
      }
      _drawPerfRows(breakdown);
    });
  });

  _drawPerfRows(breakdown);
}

/**
 * @param {Array<object>} breakdown
 */
function _drawPerfRows(breakdown) {
  const { col, asc } = _sortState;

  // Update header sort indicators
  document.querySelectorAll('#team-perf-table thead th[data-col]').forEach(th => {
    const isActive = th.getAttribute('data-col') === col;
    th.classList.toggle('sorted', isActive);
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = !isActive ? '↕' : (asc ? '↑' : '↓');
  });

  // Sort a copy
  const sorted = [...breakdown].sort((a, b) => {
    const av = a[col] ?? (col === 'response_time_median_hours' ? Infinity : -Infinity);
    const bv = b[col] ?? (col === 'response_time_median_hours' ? Infinity : -Infinity);
    if (typeof av === 'string') return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    return asc ? av - bv : bv - av;
  });

  // Compute "top performer" per numeric column (best value)
  const numCols = ['leads_received', 'leads_contacted', 'active_listings', 'cobrokes_sent', 'cobrokes_received'];
  /** @type {Record<string,string>} map col → agent_id of top performer */
  const topPerformer = {};
  numCols.forEach(c => {
    let best = -Infinity, bestId = null;
    breakdown.forEach(a => {
      const v = a[c] ?? 0;
      if (v > best) { best = v; bestId = a.agent_id; }
    });
    if (best > 0 && bestId) topPerformer[c] = bestId;
  });
  // Response time: lower is better (skip nulls)
  {
    let best = Infinity, bestId = null;
    breakdown.forEach(a => {
      const v = a.response_time_median_hours;
      if (v != null && v < best) { best = v; bestId = a.agent_id; }
    });
    if (bestId) topPerformer['response_time_median_hours'] = bestId;
  }

  // Compute team averages
  const avg = (c) => {
    const vals = breakdown.map(a => a[c]).filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const fmtHrs = (v) => v == null ? '—' : `${v.toFixed(1)}h`;
  const fmtN = (v) => v == null ? '—' : String(v);

  const star = '<span class="top-badge" title="Top performer">&#9733;</span>';

  const rows = sorted.map(a => {
    const isTop = (c) => topPerformer[c] === a.agent_id ? star : '';
    return `<tr>
      <td style="font-weight:600;">${escapeHtml(a.name || '—')}</td>
      <td>${fmtN(a.leads_received)}${isTop('leads_received')}</td>
      <td>${fmtN(a.leads_contacted)}${isTop('leads_contacted')}</td>
      <td>${fmtHrs(a.response_time_median_hours)}${isTop('response_time_median_hours')}</td>
      <td>${fmtN(a.active_listings)}${isTop('active_listings')}</td>
      <td>${fmtN(a.cobrokes_sent)}${isTop('cobrokes_sent')}</td>
      <td>${fmtN(a.cobrokes_received)}${isTop('cobrokes_received')}</td>
    </tr>`;
  });

  const teamAvgRow = `<tr class="bench-row">
    <td>Team Average</td>
    <td>${avg('leads_received') != null ? avg('leads_received').toFixed(1) : '—'}</td>
    <td>${avg('leads_contacted') != null ? avg('leads_contacted').toFixed(1) : '—'}</td>
    <td>${fmtHrs(avg('response_time_median_hours'))}</td>
    <td>${avg('active_listings') != null ? avg('active_listings').toFixed(1) : '—'}</td>
    <td>${avg('cobrokes_sent') != null ? avg('cobrokes_sent').toFixed(1) : '—'}</td>
    <td>${avg('cobrokes_received') != null ? avg('cobrokes_received').toFixed(1) : '—'}</td>
  </tr>`;

  document.getElementById('team-perf-tbody').innerHTML = rows.join('') + teamAvgRow;
}

// ── INVITE AGENT FLOW ──────────────────────────────────────────────────────

/** Current invite URL for copy button */
let _currentInviteUrl = '';

window.toggleInvitePanel = () => {
  const panel = document.getElementById('invite-panel');
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden) loadInvites();
};

async function loadInvites() {
  if (!_agencyId) return;
  const data = await callManage({ action: 'get_invites', agency_id: _agencyId });
  const invites = data.invites || [];
  const wrap = document.getElementById('invite-list-wrap');
  const list = document.getElementById('invite-list-items');
  if (!invites.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  list.innerHTML = invites.map(inv => {
    const statusEl = inv.used_at
      ? `<span class="invite-status-used">Used</span>`
      : `<span class="invite-status-pending">Pending</span>`;
    const dateStr = inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const emailEl = inv.invited_email
      ? `<span class="invite-email">${escapeHtml(inv.invited_email)}</span>`
      : `<span class="invite-email" style="color:rgba(255,255,255,0.3);">No email</span>`;
    return `<div class="invite-item">${emailEl}${statusEl}<span class="invite-date">${escapeHtml(dateStr)}</span></div>`;
  }).join('');
}

window.generateInvite = async () => {
  if (!_agencyId) return;
  const email = document.getElementById('invite-email').value.trim();
  const btn = document.getElementById('btn-gen-invite');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  const data = await callManage({
    action: 'invite_agent',
    agency_id: _agencyId,
    ...(email ? { email } : {}),
  });
  btn.disabled = false;
  btn.textContent = 'Generate Invite Link';
  if (data.error) {
    alert(data.error);
    return;
  }
  _currentInviteUrl = window.location.origin + data.invite_url;
  const resultEl = document.getElementById('invite-result');
  const urlInput = document.getElementById('invite-url-display');
  urlInput.value = _currentInviteUrl;
  resultEl.style.display = '';
  document.getElementById('invite-email').value = '';
  loadInvites();
};

window.copyInviteUrl = () => {
  if (!_currentInviteUrl) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(_currentInviteUrl).then(() => {
      const btn = document.getElementById('btn-copy-invite');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  } else {
    const input = document.getElementById('invite-url-display');
    input.select();
    document.execCommand('copy');
  }
};

init();
