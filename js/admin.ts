// admin.ts — SellingDubai Admin Panel SPA
//
// Built as a separate esbuild entry point. __SUPABASE_URL__ is injected at
// build time and used to construct the admin-action edge function URL.

declare const __SUPABASE_URL__: string;

const API_URL = `${__SUPABASE_URL__}/functions/v1/admin-action`;

// ─── Auth helpers ────────────────────────────────────────────────────────────

function getToken(): string | null {
  return sessionStorage.getItem("sd_admin_token");
}

function setToken(t: string): void {
  sessionStorage.setItem("sd_admin_token", t);
}

function clearToken(): void {
  sessionStorage.removeItem("sd_admin_token");
}

// ─── API client ──────────────────────────────────────────────────────────────

async function callAdmin(
  action: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, params }),
  });

  if (res.status === 401) {
    clearToken();
    throw new Error("Session expired");
  }

  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data;
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str: unknown): string {
  return String(str ?? "").replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Login ───────────────────────────────────────────────────────────────────

function showLogin(msg = ""): void {
  el("login-overlay").style.display = "flex";
  el("app").style.display = "none";
  const err = el("login-error");
  err.textContent = msg;
  err.style.display = msg ? "block" : "none";
  el<HTMLInputElement>("token-input").value = "";
}

function showApp(): void {
  el("login-overlay").style.display = "none";
  el("app").style.display = "flex";
}

async function attemptLogin(token: string): Promise<void> {
  const btn = el<HTMLButtonElement>("login-btn");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  setToken(token);
  try {
    await callAdmin("get_overview");
    showApp();
    navigate(location.hash.slice(1) || "overview");
  } catch (err) {
    clearToken();
    const msg = err instanceof Error ? err.message : "Login failed";
    showLogin(msg === "Session expired" ? "Invalid token. Please try again." : `Login failed: ${msg}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enter";
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

const PAGES = ["overview", "agents", "leads", "revenue", "flags", "audit", "health"] as const;
type Page = (typeof PAGES)[number];

function navigate(raw: string): void {
  const page: Page = (PAGES as readonly string[]).includes(raw)
    ? (raw as Page)
    : "overview";

  if (location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);

  document.querySelectorAll<HTMLElement>(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  document.querySelectorAll<HTMLElement>(".page-section").forEach((section) => {
    section.style.display = section.id === `page-${page}` ? "block" : "none";
  });

  loadPage(page);
}

async function loadPage(page: Page): Promise<void> {
  const container = el(`page-${page}`);
  container.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    switch (page) {
      case "overview": await renderOverview(container); break;
      case "agents":   await renderAgents(container); break;
      case "leads":    await renderLeads(container); break;
      case "revenue":  await renderRevenue(container); break;
      case "flags":    await renderFlags(container); break;
      case "audit":    await renderAudit(container); break;
      case "health":   await renderHealth(container); break;
    }
  } catch (err) {
    container.innerHTML = `<div class="error-msg">Failed to load: ${escHtml(String(err))}</div>`;
  }
}

// ─── Page: Overview ──────────────────────────────────────────────────────────

interface OverviewData {
  total_agents: number;
  agents_this_month: number;
  total_leads: number;
  leads_this_month: number;
  active_properties: number;
  recent_signups: Array<{ id: string; name: string; email: string; created_at: string; plan: string }>;
}

async function renderOverview(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_overview")) as OverviewData;

  c.innerHTML = `
    <h1 class="page-title">Overview</h1>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${data.total_agents.toLocaleString()}</div>
        <div class="stat-label">Total Agents</div>
        <div class="stat-delta">+${data.agents_this_month} this month</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.total_leads.toLocaleString()}</div>
        <div class="stat-label">Total Leads</div>
        <div class="stat-delta">+${data.leads_this_month} this month</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.active_properties.toLocaleString()}</div>
        <div class="stat-label">Active Listings</div>
        <div class="stat-delta">&nbsp;</div>
      </div>
    </div>
    <h2 class="section-title">Recent Signups</h2>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Plan</th><th>Joined</th></tr></thead>
      <tbody>
        ${data.recent_signups.map((a) => `
          <tr>
            <td>${escHtml(a.name)}</td>
            <td class="mono">${escHtml(a.email)}</td>
            <td><span class="badge badge--${escAttr(a.tier ?? "free")}">${escHtml(a.tier ?? "free")}</span></td>
            <td class="mono">${fmtDate(a.created_at)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// ─── Page: Agents ────────────────────────────────────────────────────────────

interface AgentRow {
  id: string; name: string; email: string; slug: string;
  tier: string; created_at: string; is_active: boolean;
  verification_status: string;
}

let agentsSearch = "";
let agentsPlan = "";
let agentsPage = 0;

async function renderAgents(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_agents", {
    search: agentsSearch || undefined,
    plan: agentsPlan || undefined,
    page: agentsPage,
  })) as { agents: AgentRow[] };

  c.innerHTML = `
    <h1 class="page-title">Agents</h1>
    <div class="toolbar">
      <input id="agents-search" class="search-input" type="search"
        placeholder="Search name or email…" value="${escAttr(agentsSearch)}">
      <select id="agents-plan" class="filter-select">
        <option value="">All plans</option>
        <option value="free"    ${agentsPlan === "free"    ? "selected" : ""}>Free</option>
        <option value="pro"     ${agentsPlan === "pro"     ? "selected" : ""}>Pro</option>
        <option value="premium" ${agentsPlan === "premium" ? "selected" : ""}>Premium</option>
      </select>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>Name</th><th>Email</th><th>Slug</th><th>Plan</th><th>Status</th><th>Verification</th><th>Joined</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${data.agents.length === 0
          ? `<tr><td colspan="8" class="empty-cell">No agents found.</td></tr>`
          : data.agents.map((a) => `
            <tr>
              <td>${escHtml(a.name)}</td>
              <td class="mono">${escHtml(a.email)}</td>
              <td class="mono">${escHtml(a.slug)}</td>
              <td><span class="badge badge--${escAttr(a.tier ?? "free")}">${escHtml(a.tier ?? "free")}</span></td>
              <td><span class="badge badge--${a.is_active ? "active" : "suspended"}">${a.is_active ? "active" : "suspended"}</span></td>
              <td><span class="badge badge--${escAttr(a.verification_status ?? "unverified")}">${escHtml(a.verification_status ?? "unverified")}</span></td>
              <td class="mono">${fmtDate(a.created_at)}</td>
              <td class="actions-cell">
                ${a.verification_status === "pending" ? `
                <button class="action-btn action-btn--approve" data-act="approve" data-id="${escAttr(a.id)}">Approve</button>
                <button class="action-btn action-btn--danger" data-act="reject" data-id="${escAttr(a.id)}">Reject</button>
                ` : ""}
                <button class="action-btn" data-act="suspend" data-id="${escAttr(a.id)}" data-active="${a.is_active}">
                  ${a.is_active ? "Suspend" : "Unsuspend"}
                </button>
                <button class="action-btn action-btn--danger" data-act="delete" data-id="${escAttr(a.id)}" data-name="${escAttr(a.name)}">
                  Delete
                </button>
              </td>
            </tr>`).join("")}
      </tbody>
    </table>
    <div class="pagination">
      ${agentsPage > 0 ? `<button id="agents-prev" class="page-btn">← Prev</button>` : ""}
      <span class="page-info">Page ${agentsPage + 1}</span>
      ${data.agents.length === 50 ? `<button id="agents-next" class="page-btn">Next →</button>` : ""}
    </div>`;

  let searchTimer: ReturnType<typeof setTimeout>;
  c.querySelector("#agents-search")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      agentsSearch = (e.target as HTMLInputElement).value;
      agentsPage = 0;
      renderAgents(c);
    }, 300);
  });
  c.querySelector("#agents-plan")?.addEventListener("change", (e) => {
    agentsPlan = (e.target as HTMLSelectElement).value;
    agentsPage = 0;
    renderAgents(c);
  });
  c.querySelector("#agents-prev")?.addEventListener("click", () => { agentsPage--; renderAgents(c); });
  c.querySelector("#agents-next")?.addEventListener("click", () => { agentsPage++; renderAgents(c); });

  c.querySelectorAll<HTMLElement>("[data-act='suspend']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const active = btn.dataset.active === "true";
      if (!confirm(`${active ? "Suspend" : "Unsuspend"} this agent?`)) return;
      btn.disabled = true;
      try {
        await callAdmin("suspend_agent", { agent_id: id, suspended: active });
        renderAgents(c);
      } catch (err) {
        alert(`Failed: ${String(err)}`);
        btn.disabled = false;
      }
    });
  });

  c.querySelectorAll<HTMLElement>("[data-act='approve']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      if (!confirm("Approve this agent? Their profile will go live.")) return;
      btn.disabled = true;
      try {
        await callAdmin("approve_agent", { agent_id: id });
        renderAgents(c);
      } catch (err) {
        alert(`Failed: ${String(err)}`);
        btn.disabled = false;
      }
    });
  });

  c.querySelectorAll<HTMLElement>("[data-act='reject']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      if (!confirm("Reject this agent? Their verification_status will be set to unverified.")) return;
      btn.disabled = true;
      try {
        await callAdmin("reject_agent", { agent_id: id });
        renderAgents(c);
      } catch (err) {
        alert(`Failed: ${String(err)}`);
        btn.disabled = false;
      }
    });
  });

  c.querySelectorAll<HTMLElement>("[data-act='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const name = btn.dataset.name!;
      if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        await callAdmin("delete_agent", { agent_id: id });
        renderAgents(c);
      } catch (err) {
        alert(`Failed: ${String(err)}`);
        btn.disabled = false;
      }
    });
  });
}

// ─── Page: Leads ─────────────────────────────────────────────────────────────

interface LeadRow {
  id: string; name: string; email: string; phone: string; agent_id: string;
  status: string; source: string; created_at: string; budget_range: string | null;
}

let leadsStatus = "";
let leadsPage = 0;

async function renderLeads(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_leads", {
    status: leadsStatus || undefined,
    page: leadsPage,
  })) as { leads: LeadRow[] };

  c.innerHTML = `
    <h1 class="page-title">Leads</h1>
    <div class="toolbar">
      <select id="leads-status" class="filter-select">
        <option value="">All statuses</option>
        <option value="new"       ${leadsStatus === "new"       ? "selected" : ""}>New</option>
        <option value="contacted" ${leadsStatus === "contacted" ? "selected" : ""}>Contacted</option>
        <option value="converted" ${leadsStatus === "converted" ? "selected" : ""}>Converted</option>
      </select>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Source</th><th>Budget</th><th>Created</th></tr>
      </thead>
      <tbody>
        ${data.leads.length === 0
          ? `<tr><td colspan="7" class="empty-cell">No leads found.</td></tr>`
          : data.leads.map((l) => `
            <tr>
              <td>${escHtml(l.name)}</td>
              <td class="mono">${escHtml(l.email)}</td>
              <td class="mono">${escHtml(l.phone)}</td>
              <td><span class="badge badge--${escAttr(l.status ?? "new")}">${escHtml(l.status ?? "new")}</span></td>
              <td>${escHtml(l.source)}</td>
              <td class="mono">${escHtml(l.budget_range ?? "—")}</td>
              <td class="mono">${fmtTime(l.created_at)}</td>
            </tr>`).join("")}
      </tbody>
    </table>
    <div class="pagination">
      ${leadsPage > 0 ? `<button id="leads-prev" class="page-btn">← Prev</button>` : ""}
      <span class="page-info">Page ${leadsPage + 1}</span>
      ${data.leads.length === 50 ? `<button id="leads-next" class="page-btn">Next →</button>` : ""}
    </div>`;

  c.querySelector("#leads-status")?.addEventListener("change", (e) => {
    leadsStatus = (e.target as HTMLSelectElement).value;
    leadsPage = 0;
    renderLeads(c);
  });
  c.querySelector("#leads-prev")?.addEventListener("click", () => { leadsPage--; renderLeads(c); });
  c.querySelector("#leads-next")?.addEventListener("click", () => { leadsPage++; renderLeads(c); });
}

// ─── Page: Revenue ───────────────────────────────────────────────────────────

interface PaidAgent { id: string; name: string; email: string; tier: string; created_at: string; }
interface SubEvent  { agent_id: string; event_type: string; amount_cents: number | null; created_at: string; tier: string; }

const PLAN_PRICE: Record<string, number> = { pro: 99, premium: 299 };

async function renderRevenue(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_revenue")) as {
    paid_agents: PaidAgent[];
    subscription_events: SubEvent[];
  };

  const mrr = data.paid_agents.reduce(
    (acc, a) => acc + (PLAN_PRICE[a.tier] ?? 0),
    0,
  );

  c.innerHTML = `
    <h1 class="page-title">Revenue</h1>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">$${mrr.toLocaleString()}</div>
        <div class="stat-label">Estimated MRR</div>
        <div class="stat-delta">Based on plan prices</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.paid_agents.length}</div>
        <div class="stat-label">Paid Agents</div>
        <div class="stat-delta">&nbsp;</div>
      </div>
    </div>
    <h2 class="section-title">Paid Agents</h2>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Plan</th><th>Since</th></tr></thead>
      <tbody>
        ${data.paid_agents.length === 0
          ? `<tr><td colspan="4" class="empty-cell">No paid agents yet.</td></tr>`
          : data.paid_agents.map((a) => `
            <tr>
              <td>${escHtml(a.name)}</td>
              <td class="mono">${escHtml(a.email)}</td>
              <td><span class="badge badge--${escAttr(a.tier)}">${escHtml(a.tier)}</span></td>
              <td class="mono">${fmtDate(a.created_at)}</td>
            </tr>`).join("")}
      </tbody>
    </table>
    <h2 class="section-title">Recent Subscription Events</h2>
    <table class="data-table">
      <thead><tr><th>Type</th><th>Plan</th><th>Amount</th><th>Date</th></tr></thead>
      <tbody>
        ${data.subscription_events.length === 0
          ? `<tr><td colspan="4" class="empty-cell">No subscription events yet.</td></tr>`
          : data.subscription_events.slice(0, 50).map((e) => `
            <tr>
              <td>${escHtml(e.event_type)}</td>
              <td>${escHtml(e.tier)}</td>
              <td class="mono">${e.amount_cents != null ? `$${(e.amount_cents / 100).toLocaleString()}` : "—"}</td>
              <td class="mono">${fmtTime(e.created_at)}</td>
            </tr>`).join("")}
      </tbody>
    </table>`;
}

// ─── Page: Feature Flags ─────────────────────────────────────────────────────

interface FlagRow { id: string; name: string; description: string; enabled: boolean; updated_at: string; }

async function renderFlags(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_feature_flags")) as { flags: FlagRow[] };

  c.innerHTML = `
    <h1 class="page-title">Feature Flags</h1>
    <p class="page-desc">Toggle runtime features without a deploy. Changes take effect immediately for all new requests.</p>
    <table class="data-table">
      <thead><tr><th>Flag</th><th>Description</th><th>Last Updated</th><th>State</th></tr></thead>
      <tbody>
        ${data.flags.length === 0
          ? `<tr><td colspan="4" class="empty-cell">No feature flags defined. Insert rows into the <code>feature_flags</code> table to add flags.</td></tr>`
          : data.flags.map((f) => `
            <tr>
              <td class="mono">${escHtml(f.name)}</td>
              <td>${escHtml(f.description)}</td>
              <td class="mono">${fmtTime(f.updated_at)}</td>
              <td>
                <label class="toggle" title="${f.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}">
                  <input type="checkbox" class="flag-toggle visually-hidden"
                    data-name="${escAttr(f.name)}" ${f.enabled ? "checked" : ""}>
                  <span class="toggle-track" aria-hidden="true">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </td>
            </tr>`).join("")}
      </tbody>
    </table>`;

  c.querySelectorAll<HTMLInputElement>(".flag-toggle").forEach((input) => {
    input.addEventListener("change", async () => {
      const name = input.dataset.name!;
      const enabled = input.checked;
      input.disabled = true;
      try {
        await callAdmin("toggle_feature_flag", { name, enabled });
      } catch (err) {
        alert(`Failed to toggle ${name}: ${String(err)}`);
        input.checked = !enabled;
      } finally {
        input.disabled = false;
      }
    });
  });
}

// ─── Page: Audit Log ─────────────────────────────────────────────────────────

interface AuditRow { id: string; action: string; target_agent_id: string | null; details: Record<string, unknown>; created_at: string; }

let auditPage = 0;

async function renderAudit(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_audit_log", { page: auditPage })) as { entries: AuditRow[] };

  c.innerHTML = `
    <h1 class="page-title">Audit Log</h1>
    <table class="data-table">
      <thead><tr><th>Action</th><th>Target Agent</th><th>Details</th><th>Time</th></tr></thead>
      <tbody>
        ${data.entries.length === 0
          ? `<tr><td colspan="4" class="empty-cell">No audit entries yet.</td></tr>`
          : data.entries.map((e) => `
            <tr>
              <td class="mono">${escHtml(e.action)}</td>
              <td class="mono">${e.target_agent_id ? `${escHtml(e.target_agent_id.slice(0, 8))}…` : "—"}</td>
              <td class="mono details-cell">${escHtml(JSON.stringify(e.details))}</td>
              <td class="mono">${fmtTime(e.created_at)}</td>
            </tr>`).join("")}
      </tbody>
    </table>
    <div class="pagination">
      ${auditPage > 0 ? `<button id="audit-prev" class="page-btn">← Prev</button>` : ""}
      <span class="page-info">Page ${auditPage + 1}</span>
      ${data.entries.length === 50 ? `<button id="audit-next" class="page-btn">Next →</button>` : ""}
    </div>`;

  c.querySelector("#audit-prev")?.addEventListener("click", () => { auditPage--; renderAudit(c); });
  c.querySelector("#audit-next")?.addEventListener("click", () => { auditPage++; renderAudit(c); });
}

// ─── Page: Platform Health ───────────────────────────────────────────────────

async function renderHealth(c: HTMLElement): Promise<void> {
  const data = (await callAdmin("get_platform_health")) as { functions: string[] };

  c.innerHTML = `
    <h1 class="page-title">Platform Health</h1>
    <p class="page-desc">Live OPTIONS ping to each edge function. A 2xx or 4xx response means the function is reachable; 5xx or timeout means degraded.</p>
    <table class="data-table">
      <thead><tr><th>Function</th><th>Status</th><th>Latency</th></tr></thead>
      <tbody>
        ${data.functions.map((fn) => `
          <tr id="health-${escAttr(fn)}">
            <td class="mono">${escHtml(fn)}</td>
            <td><span class="badge badge--pending">Pinging…</span></td>
            <td class="mono">—</td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  await Promise.allSettled(data.functions.map((fn) => pingFn(fn)));
}

async function pingFn(fn: string): Promise<void> {
  const row = document.getElementById(`health-${fn}`);
  if (!row) return;
  const start = Date.now();
  try {
    const res = await fetch(`${__SUPABASE_URL__}/functions/v1/${fn}`, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(6000),
    });
    const ms = Date.now() - start;
    let badgeClass: string;
    let label: string;
    if (res.status === 200 && ms > 2000) {
      badgeClass = "badge--pending";
      label = `${res.status} Slow`;
    } else if (res.status === 200) {
      badgeClass = "badge--active";
      label = `${res.status} OK`;
    } else {
      badgeClass = "badge--error";
      label = `${res.status} Error`;
    }
    row.children[1].innerHTML = `<span class="badge ${badgeClass}">${label}</span>`;
    row.children[2].textContent = `${ms}ms`;
  } catch {
    const ms = Date.now() - start;
    row.children[1].innerHTML = `<span class="badge badge--error">Timeout</span>`;
    row.children[2].textContent = `${ms}ms`;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init(): void {
  el("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el<HTMLInputElement>("token-input");
    if (!input.value.trim()) return;
    await attemptLogin(input.value.trim());
  });

  document.querySelectorAll<HTMLElement>(".nav-item").forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.page ?? "overview"));
  });

  el("logout-btn").addEventListener("click", () => {
    clearToken();
    showLogin();
  });

  window.addEventListener("hashchange", () => {
    if (getToken()) navigate(location.hash.slice(1) || "overview");
  });

  if (getToken()) {
    showApp();
    navigate(location.hash.slice(1) || "overview");
  } else {
    showLogin();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
