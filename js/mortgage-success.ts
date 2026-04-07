// ==========================================
// MORTGAGE SUCCESS CTA + DOC UPLOAD (lazy loaded from mortgage.ts step 4)
// ==========================================

import { logEvent } from './analytics';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { escHtml } from './utils';

const fmtAEDMort = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

interface MortPayload {
  property_value?: number | null;
  max_loan_amount?: number | null;
  estimated_monthly?: number | null;
  preferred_rate_type?: string;
  assigned_bank?: string | null;
}

interface MortStateSlice {
  appId: string | null;
  editToken: string | null;
  data: {
    loanAmt?: number;
    totalInterest?: number;
  };
}

export function injectMortgageSuccessCta(payload: MortPayload, state: MortStateSlice): void {
  const step4 = document.getElementById('mort-step-4');
  if (!step4) return;
  const prev = document.getElementById('mort-success-inject');
  if (prev) prev.remove();

  const summaryParts: string[] = [];
  if (payload.property_value) summaryParts.push(`Property: ${fmtAEDMort(payload.property_value)}`);
  if (payload.max_loan_amount) summaryParts.push(`Max loan: ${fmtAEDMort(payload.max_loan_amount)}`);
  if (payload.estimated_monthly) summaryParts.push(`Max monthly: ${fmtAEDMort(payload.estimated_monthly)}`);
  if (payload.preferred_rate_type) summaryParts.push(`Rate: ${payload.preferred_rate_type}`);
  if (payload.assigned_bank) summaryParts.push(`Bank: ${payload.assigned_bank}`);

  const doneBtn = step4.querySelector('.modal-btn:last-child');
  const injectEl = document.createElement('div');
  injectEl.id = 'mort-success-inject';

  let html = '';
  if (summaryParts.length > 0) {
    html += `<div style="background:rgba(77,101,255,0.06);border:1px solid rgba(77,101,255,0.12);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:10px;color:rgba(77,101,255,0.7);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Your Pre-Qualification Summary</div>
      ${summaryParts.map(s => `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.4);font-weight:300;">${escHtml(s.split(': ')[0] ?? '')}</span><span style="font-size:12px;color:#fff;font-weight:600;">${escHtml(s.split(': ')[1] || '')}</span></div>`).join('')}
    </div>`;
  }

  html += `<div style="display:flex;align-items:center;gap:10px;background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.12);border-radius:10px;padding:14px 16px;margin-bottom:12px;">
    <div style="width:32px;height:32px;border-radius:50%;background:rgba(37,211,102,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    </div>
    <div>
      <span style="font-size:12px;color:#fff;font-weight:600;display:block;margin-bottom:2px;">A licensed broker will WhatsApp you</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:300;">Typically within 2 hours during business hours</span>
    </div>
  </div>`;

  const loanAmt   = state.data.loanAmt ?? 0;
  const totalInt   = state.data.totalInterest ?? 0;
  const totalPaid  = loanAmt + totalInt;

  if (totalPaid > 0) {
    const principalPct = Math.round((loanAmt / totalPaid) * 100);
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

export async function mortDocUploaded(input: HTMLInputElement, docType: string, appId: string | null, editToken: string | null): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  const statusEl = document.getElementById(`mort-doc-${docType}-status`);
  const row = input.closest('.mort-upload-row');
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const MAX_SIZE = 10 * 1024 * 1024;
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
    const path = `${appId || 'pending'}/${docType}_${Date.now()}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/mortgage-docs/${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file
    });
    if (res.ok) {
      if (statusEl) statusEl.textContent = file.name;
      if (row) row.classList.add('uploaded');
      const checkEl = document.getElementById(`mort-doc-${docType}-check`);
      if (checkEl) checkEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
      if (appId && editToken) {
        await fetch(`${SUPABASE_URL}/functions/v1/update-mortgage-docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ id: appId, edit_token: editToken, doc_type: docType, path })
        });
      }
      logEvent('mortgage_doc_uploaded', { type: docType });
    } else { if (statusEl) statusEl.textContent = 'Upload failed — tap to retry'; }
  } catch (_e) { if (statusEl) statusEl.textContent = 'Upload failed — tap to retry'; }
}
