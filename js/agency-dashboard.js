// @ts-check
const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
const MANAGE_URL = SUPABASE_URL + '/functions/v1/manage-agency';
const STATS_URL = SUPABASE_URL + '/functions/v1/agency-stats';

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
  document.getElementById('agency-slug-el').textContent = '/' + agency.slug;
  const link = document.getElementById('agency-profile-link');
  link.href = '/agency/' + agency.slug;
  link.textContent = 'sellingdubai.ae/agency/' + agency.slug;
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
  try {
    const res = await fetch(STATS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _token })
    });
    const data = await res.json();
    if (!data.totals) return;
    const t = data.totals;
    document.getElementById('m-leads-month').textContent = t.leads_this_month;
    document.getElementById('m-leads-last').textContent = t.leads_last_month + ' last month';
    document.getElementById('m-views-month').textContent = t.views_this_month;
    document.getElementById('m-views-last').textContent = t.views_last_month + ' last month';
    document.getElementById('m-wa-month').textContent = t.wa_taps_this_month;
    document.getElementById('m-props').textContent = t.properties_active;
    document.getElementById('m-agents-count').textContent = t.agents_count + ' agents';
    renderMembersTable(data.agents || []);
  } catch(e) {
    renderMembersTable(membersFromGet.map(m => ({ ...m })));
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
    const photoSrc = a.photo_url && a.photo_url.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? `/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=64&fm=webp&q=80`
      : a.photo_url;
    const photoSrcset = a.photo_url && a.photo_url.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
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
            <div class="member-slug"><a href="/a/${encodeURIComponent(a.slug)}" target="_blank" style="color:rgba(255,255,255,0.4);">@${escapeHtml(a.slug)}</a></div>
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

window.createAgency = async function() {
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

window.toggleEditPanel = function() {
  const panel = document.getElementById('edit-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

window.saveAgency = async function() {
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

window.addMember = async function() {
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

window.removeMember = async function(memberId, memberName) {
  if (!confirm(`Remove ${memberName} from the agency?`)) return;
  const errEl = document.getElementById('member-error');
  errEl.classList.remove('show');
  const data = await callManage({ action: 'remove_member', agency_id: _agencyId, member_id: memberId });
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  const refreshData = await callManage({ action: 'get_my_agency' });
  if (refreshData.agency) loadStats(refreshData.members || []);
};

init();
