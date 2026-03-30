// ==========================================
// OFF-PLAN PROJECT DETAIL (lazy loaded)
// ==========================================
import { supabase } from './config.js';
import { escHtml, escAttr } from './utils.js';
import { currentAgent } from './state.js';

const NETLIFY_IMG = (url, w) =>
  url ? `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80` : '';

const fmtPrice = (n) =>
  n ? 'AED\u00a0' + Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 }) : null;

const statusLabel = (s) =>
  s === 'under_construction' ? 'Under Construction'
  : s === 'completed' ? 'Completed'
  : 'Off Plan';

export async function openProjectDetail(projectSlug) {
  const sheet = document.getElementById('detail-sheet');
  const overlay = document.getElementById('detail-overlay');
  if (!sheet || !overlay) return;

  // Show loading state
  sheet.innerHTML = `
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project…</div>`;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  const { data: project, error } = await supabase
    .from('projects')
    .select('slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,status,property_types,beds,developers(name,logo_url,website)')
    .eq('slug', projectSlug)
    .single();

  if (error || !project) {
    sheet.innerHTML = `
      <button class="detail-back" onclick="closeDetail()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;
    return;
  }

  const dev = project.developers || {};
  const imgSrc = project.cover_image_url ? NETLIFY_IMG(project.cover_image_url, 800) : '';
  const minP = fmtPrice(project.min_price);
  const maxP = fmtPrice(project.max_price);
  const priceStr = minP && maxP ? `${minP} – ${maxP}` : (minP || maxP || '');
  const loc = project.district_name || project.location || project.area || '';
  const types = Array.isArray(project.property_types) && project.property_types.length
    ? project.property_types.join(', ') : '';
  const areaStr = project.min_area_sqft && project.max_area_sqft
    ? `${Number(project.min_area_sqft).toLocaleString()} – ${Number(project.max_area_sqft).toLocaleString()} sqft`
    : project.min_area_sqft
      ? `From ${Number(project.min_area_sqft).toLocaleString()} sqft`
      : '';

  // Gallery images (exclude cover if already in list)
  const galleryImgs = Array.isArray(project.gallery_images) && project.gallery_images.length
    ? project.gallery_images.filter(u => u && u !== project.cover_image_url)
    : [];

  // Floor plans
  const floorPlans = Array.isArray(project.floor_plan_urls) && project.floor_plan_urls.length
    ? project.floor_plan_urls.filter(Boolean)
    : [];

  // Available units
  const units = project.available_units && typeof project.available_units === 'object'
    ? (Array.isArray(project.available_units) ? project.available_units : project.available_units.units || [])
    : [];

  // Payment plan — prefer payment_plan_detail (new_payment_plans array) > legacy payment_plan JSONB > handover_percentage
  let bookingPct = null, constructionPct = null, handoverPct = null;
  let paymentPlanTitle = null;
  let paymentMilestones = null; // full milestone array for detailed view

  const ppDetail = project.payment_plan_detail;
  // payment_plan_detail is stored as the new_payment_plans array
  const ppPlan = Array.isArray(ppDetail) && ppDetail.length > 0 ? ppDetail[0] : null;

  if (ppPlan && typeof ppPlan === 'object') {
    paymentPlanTitle = ppPlan.title || null;
    paymentMilestones = Array.isArray(ppPlan.milestones) && ppPlan.milestones.length ? ppPlan.milestones : null;
    const hp = ppPlan.heading_percentages;
    if (hp && typeof hp === 'object') {
      // Normalize keys: "On Booking" → booking, "During Construction" → construction, "On Completion" → handover
      for (const [k, v] of Object.entries(hp)) {
        const key = k.toLowerCase();
        const val = v ? parseInt(String(v), 10) : null;
        if (key.includes('booking')) bookingPct = val;
        else if (key.includes('construction')) constructionPct = val;
        else if (key.includes('completion') || key.includes('handover')) handoverPct = val;
      }
    }
  } else {
    const pp = project.payment_plan;
    if (pp && typeof pp === 'object' && !Array.isArray(pp)) {
      bookingPct = pp.booking ?? pp.booking_percentage ?? null;
      constructionPct = pp.construction ?? pp.construction_percentage ?? null;
      handoverPct = pp.handover ?? pp.handover_percentage ?? null;
    } else if (project.handover_percentage != null) {
      handoverPct = project.handover_percentage;
      bookingPct = 10;
      constructionPct = Math.max(0, 100 - bookingPct - handoverPct);
    }
  }
  const hasPaymentPlan = bookingPct != null || constructionPct != null || handoverPct != null;

  const completionStr = project.completion_date
    ? new Date(project.completion_date).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })
    : null;

  sheet.innerHTML = `
    <button class="detail-back" onclick="closeDetail()" aria-label="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    </button>

    ${imgSrc || galleryImgs.length ? `
    <div style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;flex-shrink:0;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
      ${imgSrc ? `<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${escAttr(imgSrc)}" alt="${escAttr(project.name)}" style="width:100%;height:240px;object-fit:cover;" loading="eager" onerror="handleImgError(this)"></div>` : ''}
      ${galleryImgs.map((u, i) => `<div style="flex:0 0 100%;scroll-snap-align:start;"><img src="${escAttr(NETLIFY_IMG(u, 800))}" alt="${escAttr(project.name)} photo ${i + 2}" style="width:100%;height:240px;object-fit:cover;" loading="lazy" onerror="handleImgError(this)"></div>`).join('')}
    </div>` : ''}

    <div class="detail-body" style="padding:20px 20px 40px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${escHtml(statusLabel(project.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${escHtml(project.name)}</h2>
        ${loc ? `<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">📍 ${escHtml(loc)}</div>` : ''}
      </div>

      <!-- Price -->
      ${priceStr ? `<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${escHtml(priceStr)}</div>` : ''}

      <!-- Specs row -->
      ${(types || project.beds || areaStr || completionStr) ? `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${types ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${escHtml(types)}</span></div>` : ''}
        ${project.beds ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${escHtml(project.beds)}</span></div>` : ''}
        ${areaStr ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${escHtml(areaStr)}</span></div>` : ''}
        ${completionStr ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${escHtml(completionStr)}</span></div>` : ''}
      </div>` : ''}

      <!-- Developer card -->
      ${dev.name ? `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${dev.logo_url ? `<img src="${escAttr(NETLIFY_IMG(dev.logo_url, 80))}" alt="${escAttr(dev.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">` : `<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏗️</div>`}
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;">Developer</div>
          <div style="font-weight:600;font-size:14px;">${escHtml(dev.name)}</div>
          ${dev.website ? `<a href="${escAttr(dev.website)}" target="_blank" rel="noopener" style="font-size:11px;color:rgba(255,255,255,0.4);text-decoration:none;">${escHtml(dev.website.replace(/^https?:\/\//, ''))}</a>` : ''}
        </div>
      </div>` : ''}

      <!-- Payment plan -->
      ${hasPaymentPlan ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${bookingPct != null ? `<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${bookingPct}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>` : ''}
          ${constructionPct != null ? `<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${constructionPct}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>` : ''}
          ${handoverPct != null ? `<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${handoverPct}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>` : ''}
        </div>
      </div>` : `
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Payment Plan</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);">Contact the agent for full payment plan details.</div>
      </div>`}

      <!-- Available units -->
      ${units.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${units.map(u => `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:600;">${escHtml(u.unit_type || u.type || u.name || 'Unit')}</div>
              ${u.area_sqft || u.area ? `<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;">${escHtml(String(u.area_sqft || u.area))} sqft</div>` : ''}
            </div>
            ${u.price || u.min_price ? `<div style="font-size:13px;font-weight:700;">AED\u00a0${Number(u.price || u.min_price).toLocaleString('en-AE', {maximumFractionDigits:0})}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Floor plans -->
      ${floorPlans.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Floor Plans</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${floorPlans.map((u, i) => `<img src="${escAttr(NETLIFY_IMG(u, 800))}" alt="Floor plan ${i + 1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join('')}
        </div>
      </div>` : ''}

      <!-- Description -->
      ${project.description ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <p style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);">${escHtml(project.description)}</p>
      </div>` : ''}

      <!-- CTAs -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
        <button onclick="openLead('${escAttr(project.name)}')" style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Send Enquiry</button>
        ${currentAgent?.whatsapp ? `<a href="https://wa.me/${encodeURIComponent(currentAgent.whatsapp.replace(/[^0-9]/g,''))}?text=${encodeURIComponent('Hi, I\'m interested in ' + project.name + ' — can you tell me more?')}" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-align:center;text-decoration:none;">WhatsApp Agent</a>` : ''}
      </div>

    </div>`;
}
