import { escHtml } from './utils.js';

interface OffPlanMilestone { trigger: string; percentage?: number; }
interface OffPlanProject { name?: string; minPrice?: number; milestones?: OffPlanMilestone[]; completionDate?: string; }

export function renderOffPlanBreakdown(proj: OffPlanProject) {
  const price  = proj.minPrice || 0;
  const miles  = Array.isArray(proj.milestones) ? proj.milestones : ([] as OffPlanMilestone[]);
  const fmtPct = (pct: number) => `${pct}%`;
  const fmtAmt = (n: number)   => 'AED ' + Math.round(n).toLocaleString();

  const booking      = miles.find(m => m.trigger === 'on_booking')    || miles[0];
  const handover     = miles.find(m => m.trigger === 'on_handover')   || miles[miles.length - 1];
  const construction = miles.filter(m => m !== booking && m !== handover);

  // UAE off-plan standard (20/80) as fallback when milestones are absent
  const bookingPct  = booking?.percentage  || (miles.length === 0 ? 20 : 0);
  const handoverPct = handover?.percentage || (miles.length === 0 ? 80 : 0);
  const constPct    = construction.reduce((sum, m) => sum + (m.percentage || 0), 0);

  const bookingAmt  = price * bookingPct  / 100;
  const constAmt    = price * constPct    / 100;
  const handoverAmt = price * handoverPct / 100;
  const dldFee      = price * 0.04;
  const agentComm   = price * 0.02;
  const totalCash   = bookingAmt + dldFee + agentComm;
  const loanAmount  = handoverAmt;

  const completionStr = proj.completionDate
    ? (() => { const d = new Date(proj.completionDate); return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`; })()
    : 'TBC';

  const milestoneRows = [
    { label: `Booking (${fmtPct(bookingPct)})`,    amount: bookingAmt  },
    { label: `Construction (${fmtPct(constPct)})`, amount: constAmt    },
    { label: `Handover (${fmtPct(handoverPct)})`,  amount: handoverAmt },
    { label: 'DLD Fee (4%)',                        amount: dldFee      },
  ];

  const rowsHtml = milestoneRows.map(r =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:12px;color:rgba(255,255,255,0.5);">${escHtml(r.label)}</span>
      <span style="font-size:12px;color:#fff;font-weight:600;">${fmtAmt(r.amount)}</span>
    </div>`
  ).join('');

  const html = `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">${escHtml(proj.name)} · Completion ${escHtml(completionStr)}</div>
      <div style="font-size:10px;font-weight:600;color:rgba(77,101,255,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Payment Breakdown</div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
        ${rowsHtml}
        <div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:4px;">
          <label style="font-size:12px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="mort-op-agent-check" checked
              data-action-change="mortOpToggleAgent"
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

    <button class="modal-btn" data-action="mortOpProceed"
      style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">
      Calculate Mortgage Payments
    </button>`;

  return { html, bookingAmt, dldFee, agentComm, totalCash, loanAmount };
}
