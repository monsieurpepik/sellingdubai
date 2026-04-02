// ==========================================
// OFF-PLAN PROJECT DETAIL (lazy loaded)
// ==========================================
import { supabase } from './config.js';
import { escHtml, escAttr, optimizeImg } from './utils.js';
import { currentAgent } from './state.js';

let _detailProject = null;

const fmtPrice = (n) =>
  n ? 'AED\u00a0' + Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 }) : null;
const fmtCompact = (n) => {
  if (!n) return null;
  const num = Number(n);
  if (num >= 1_000_000) return 'AED\u00a0' + (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return 'AED\u00a0' + Math.round(num / 1_000) + 'K';
  return 'AED\u00a0' + num.toLocaleString('en-AE', { maximumFractionDigits: 0 });
};

// Strip dangerous tags from trusted CRM HTML using the browser's own HTML parser.
// DOM-based approach handles javascript: URLs, SVG XSS, and malformed markup that
// regex patterns miss.
const sanitizeHtml = (html) => {
  if (!html) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('script,iframe,object,embed,form,base').forEach(el => el.remove());
  tpl.content.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) { el.removeAttribute(attr.name); return; }
      if (/^(href|src|action|formaction)$/i.test(attr.name) && /^\s*(javascript|data):/i.test(attr.value))
        el.removeAttribute(attr.name);
    });
  });
  const wrap = document.createElement('div');
  wrap.appendChild(tpl.content.cloneNode(true));
  return wrap.innerHTML;
};

const statusLabel = (s) =>
  s === 'under_construction' ? 'Under Construction'
  : s === 'completed' ? 'Completed'
  : 'Off Plan';

// Fix 2: Filter low-quality thumbnail images by URL pattern
const isThumb = (u) => /[/_-]thumb(nail)?[/_.-]/i.test(u);

// Fix 3: Map facility names to Material Symbols icon strings
function facilityIcon(name) {
  const n = (name || '').toLowerCase();
  if (/pool|swim/.test(n)) return 'pool';
  if (/gym|gymnasium|fitness/.test(n)) return 'fitness_center';
  if (/spa|sauna|steam/.test(n)) return 'spa';
  if (/tennis/.test(n)) return 'sports_tennis';
  if (/basketball|sport/.test(n)) return 'sports_basketball';
  if (/park|garden|landscap/.test(n)) return 'park';
  if (/beach|sea|waterfront/.test(n)) return 'beach_access';
  if (/security|guard|surveillance/.test(n)) return 'security';
  if (/parking|garage/.test(n)) return 'local_parking';
  if (/elevator|lift/.test(n)) return 'elevator';
  if (/concierge|reception|lobby/.test(n)) return 'concierge';
  if (/restaurant|dine|dining|cafe|food/.test(n)) return 'restaurant';
  if (/retail|shop|mall|store/.test(n)) return 'shopping_bag';
  if (/balcony|terrace/.test(n)) return 'balcony';
  if (/pet/.test(n)) return 'pets';
  if (/kids|child|play/.test(n)) return 'child_care';
  if (/storage/.test(n)) return 'storage';
  if (/smart|iot/.test(n)) return 'home_iot_device';
  if (/cctv|camera/.test(n)) return 'videocam';
  if (/bedroom|master/.test(n)) return 'bedroom_parent';
  return 'check_circle';
}

// Fix 1: Full-screen lightbox
let _lbImgs = [], _lbIdx = 0, _lbScale = 1;

function _lbEnsureCreated() {
  if (document.getElementById('proj-lb')) return;
  const el = document.createElement('div');
  el.id = 'proj-lb';
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:none;flex-direction:column;align-items:stretch;';
  el.innerHTML = `
    <div style="position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;z-index:1;background:linear-gradient(#000a,transparent);">
      <div style="width:44px;"></div>
      <div id="proj-lb-counter" style="color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;font-family:'Inter',sans-serif;"></div>
      <button onclick="closeProjLightbox()" aria-label="Close" style="width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2715;</button>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;">
      <button onclick="window._lbStep(-1)" aria-label="Previous" id="proj-lb-prev" style="position:absolute;left:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2039;</button>
      <img id="proj-lb-img" style="max-width:100%;max-height:100%;object-fit:contain;touch-action:none;" src="" alt="">
      <button onclick="window._lbStep(1)" aria-label="Next" id="proj-lb-next" style="position:absolute;right:12px;z-index:2;width:44px;height:44px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x203A;</button>
    </div>`;
  document.body.appendChild(el);
  const img = el.querySelector('#proj-lb-img');
  let _pinching = false, _pinchDist = 0, _touchStartX = 0;
  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      _pinching = true;
      _pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    } else { _touchStartX = e.touches[0].clientX; _pinching = false; }
  }, { passive: true });
  img.addEventListener('touchmove', (e) => {
    if (_pinching && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      _lbScale = Math.max(1, Math.min(4, _lbScale * (dist / _pinchDist)));
      _pinchDist = dist;
      img.style.transform = `scale(${_lbScale})`;
    }
  }, { passive: true });
  img.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) _pinching = false;
    if (!_pinching && e.changedTouches.length === 1 && _lbScale <= 1.1) {
      const dx = e.changedTouches[0].clientX - _touchStartX;
      if (Math.abs(dx) > 50) window._lbStep(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

function _lbRender() {
  const img = document.getElementById('proj-lb-img');
  const counter = document.getElementById('proj-lb-counter');
  const prev = document.getElementById('proj-lb-prev');
  const next = document.getElementById('proj-lb-next');
  if (!img) return;
  img.src = optimizeImg(_lbImgs[_lbIdx], 1200);
  img.style.transform = `scale(${_lbScale})`;
  if (counter) counter.textContent = `${_lbIdx + 1} / ${_lbImgs.length}`;
  const multi = _lbImgs.length > 1;
  if (prev) prev.style.display = multi ? 'flex' : 'none';
  if (next) next.style.display = multi ? 'flex' : 'none';
}

window._lbStep = function(dir) {
  _lbIdx = (_lbIdx + dir + _lbImgs.length) % _lbImgs.length;
  _lbScale = 1;
  _lbRender();
};

window.openProjLightbox = function(idx) {
  _lbEnsureCreated();
  _lbIdx = idx;
  _lbScale = 1;
  const lb = document.getElementById('proj-lb');
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _lbRender();
};

window.closeProjLightbox = function() {
  const lb = document.getElementById('proj-lb');
  if (lb) lb.style.display = 'none';
  document.body.style.overflow = '';
};

export async function openProjectDetail(projectSlug) {
  const sheet = document.getElementById('detail-sheet');
  const overlay = document.getElementById('detail-overlay');
  if (!sheet || !overlay) return;

  // Show loading state
  sheet.innerHTML = `
    <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Loading project…</div>`;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  // Hide property-detail's CTA bar — project detail has its own inline sticky bar
  const ctaBar = document.getElementById('detail-cta-bar');
  if (ctaBar) ctaBar.style.display = 'none';
  // Hide profile sticky CTA bar (WhatsApp/Contact Me) — save current display to restore on close
  const stickyCta = document.getElementById('sticky-cta');
  if (stickyCta) {
    stickyCta.dataset.prevDisplay = stickyCta.style.display;
    stickyCta.style.display = 'none';
  }

  const { data: project, error } = await supabase
    .from('projects')
    .select('slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,facilities,nearby_locations,brochure_url,images_categorized,status,property_types,beds,developers(name,logo_url,website)')
    .eq('slug', projectSlug)
    .single();

  if (error || !project) {
    sheet.innerHTML = `
      <div style="text-align:center;padding:80px 24px;color:rgba(255,255,255,0.4);font-size:14px;">Project not found.</div>`;
    return;
  }

  const dev = project.developers || {};
  _detailProject = project;
  window._openProjectMortgage = function() {
    if (!_detailProject) return;
    if (typeof window.initMortModal === 'function') {
      window.initMortModal({
        mode: 'offplan',
        project: {
          name:           _detailProject.name,
          minPrice:       _detailProject.min_price,
          milestones:     _detailProject.payment_plan_detail,
          completionDate: _detailProject.completion_date,
        },
      });
    }
  };
  const imgSrc = project.cover_image_url ? optimizeImg(project.cover_image_url, 800) : '';
  const minP = fmtPrice(project.min_price);
  const maxP = fmtPrice(project.max_price);
  const priceStr = minP && maxP ? `${minP} – ${maxP}` : minP ? `From ${minP}` : (maxP || '');
  const loc = project.district_name || project.location || project.area || '';
  const types = Array.isArray(project.property_types) && project.property_types.length
    ? project.property_types.join(', ') : '';
  const areaStr = project.min_area_sqft && project.max_area_sqft
    ? `${Number(project.min_area_sqft).toLocaleString()} – ${Number(project.max_area_sqft).toLocaleString()} sqft`
    : project.min_area_sqft
      ? `From ${Number(project.min_area_sqft).toLocaleString()} sqft`
      : '';

  // Gallery: prefer images_categorized (interior + exterior), fallback to gallery_images
  const cat = project.images_categorized;
  let galleryImgs = [];
  if (cat && (cat.interior?.length || cat.exterior?.length)) {
    const combined = [...(cat.interior || []), ...(cat.exterior || [])];
    galleryImgs = combined.filter(u => u && u !== project.cover_image_url);
  } else if (Array.isArray(project.gallery_images) && project.gallery_images.length) {
    // Fallback: old gallery_images minus cover and any site plan URLs
    const sitePlanUrls = new Set(cat?.general || []);
    galleryImgs = project.gallery_images.filter(u => u && u !== project.cover_image_url && !sitePlanUrls.has(u));
  }

  // Fix 2: Filter thumbnail images; Fix 1: set lightbox array
  galleryImgs = galleryImgs.filter(u => !isThumb(u));
  _lbImgs = project.cover_image_url ? [project.cover_image_url, ...galleryImgs] : [...galleryImgs];

  // Site plan images (from images_categorized.general, or legacy floor_plan_urls)
  const sitePlanImgs = cat?.general?.filter(Boolean).length
    ? cat.general.filter(Boolean)
    : (Array.isArray(project.floor_plan_urls) ? project.floor_plan_urls.filter(Boolean) : []);

  const totalSlides = (imgSrc ? 1 : 0) + galleryImgs.length;

  // Facilities (amenities strip)
  const facilities = Array.isArray(project.facilities) && project.facilities.length
    ? project.facilities : [];

  // Nearby locations
  const nearbyLocations = Array.isArray(project.nearby_locations) && project.nearby_locations.length
    ? project.nearby_locations : [];

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

  const completionShort = project.completion_date
    ? new Date(project.completion_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    : null;

  const statCells = [];
  if (project.min_price) statCells.push({ label: 'From', value: fmtCompact(project.min_price) });
  if (completionShort) statCells.push({ label: 'Handover', value: completionShort });
  if (project.min_area_sqft) statCells.push({ label: 'Size from', value: Number(project.min_area_sqft).toLocaleString('en-AE', { maximumFractionDigits: 0 }) + '\u00a0sqft' });
  if (hasPaymentPlan) {
    const parts = [bookingPct, constructionPct, handoverPct].filter(v => v != null);
    statCells.push({ label: 'Pay plan', value: parts.join('/') });
  }
  const showStatsBar = statCells.length >= 2;

  sheet.innerHTML = `
    ${imgSrc || galleryImgs.length ? `
    <div style="position:relative;flex-shrink:0;">
      <div id="proj-gallery" style="height:240px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;display:flex;background:#111;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
        ${imgSrc ? `<div style="flex:0 0 100%;scroll-snap-align:start;cursor:pointer;" onclick="openProjLightbox(0)"><img src="${escAttr(imgSrc)}" alt="${escAttr(project.name)}" style="width:100%;height:240px;object-fit:cover;pointer-events:none;" loading="eager" onerror="handleImgError(this)"></div>` : ''}
        ${galleryImgs.map((u, i) => { const lbIdx = (imgSrc ? 1 : 0) + i; return `<div style="flex:0 0 100%;scroll-snap-align:start;cursor:pointer;" onclick="openProjLightbox(${lbIdx})"><img src="${escAttr(optimizeImg(u, 800))}" alt="${escAttr(project.name)} photo ${i + 2}" style="width:100%;height:240px;object-fit:cover;pointer-events:none;" loading="lazy" onerror="handleImgError(this)"></div>`; }).join('')}
      </div>
      ${totalSlides > 1 ? `<div id="proj-gallery-count" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;pointer-events:none;">1 / ${totalSlides}</div>` : ''}
    </div>` : ''}

    ${showStatsBar ? `
    <div style="display:grid;grid-template-columns:repeat(${statCells.length},1fr);border-bottom:1px solid rgba(255,255,255,0.06);">
      ${statCells.map((c, i) => `
      <div style="padding:10px 12px;${i < statCells.length - 1 ? 'border-right:1px solid rgba(255,255,255,0.06);' : ''}">
        <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:3px;">${escHtml(c.label)}</div>
        <div style="font-size:13px;font-weight:700;">${escHtml(c.value)}</div>
      </div>`).join('')}
    </div>` : ''}

    <div class="detail-body" style="padding:20px 20px 80px;">

      <!-- Status badge + title -->
      <div style="margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);margin-bottom:10px;display:inline-block;">${escHtml(statusLabel(project.status))}</span>
        <h2 style="font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-top:8px;">${escHtml(project.name)}</h2>
        ${loc ? `<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;">📍 ${escHtml(loc)}</div>` : ''}
      </div>

      <!-- Developer card -->
      ${dev.name ? `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        ${dev.logo_url ? `<img src="${escAttr(optimizeImg(dev.logo_url, 80))}" alt="${escAttr(dev.name)}" style="width:44px;height:44px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);flex-shrink:0;" onerror="handleImgError(this)">` : `<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏗️</div>`}
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
          ${units.map(u => {
            const bedLabel = u.bedroom ? `${u.bedroom}BR ` : '';
            const typeLabel = bedLabel + (u.property_types || 'Unit');
            const areaVal = u.lowest_area || u.area_sqft || u.area;
            const priceVal = u.lowest_price || u.price || u.min_price;
            return `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${escHtml(typeLabel)}</div>
              ${priceVal ? `<div style="font-size:13px;font-weight:700;white-space:nowrap;">AED\u00a0${Number(priceVal).toLocaleString('en-AE', {maximumFractionDigits:0})}</div>` : ''}
            </div>
            ${areaVal ? `<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">From ${escHtml(Number(areaVal).toLocaleString('en-AE', {maximumFractionDigits:0}))} sqft</div>` : ''}
          </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Site Plan -->
      ${sitePlanImgs.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Site Plan</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${sitePlanImgs.map((u, i) => `<img src="${escAttr(optimizeImg(u, 800))}" alt="Site plan ${i + 1}" style="width:100%;border-radius:10px;background:rgba(255,255,255,0.04);" loading="lazy" onerror="this.style.display='none'">`).join('')}
        </div>
      </div>` : ''}

      <!-- Facilities -->
      ${facilities.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Amenities</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${facilities.map(f => `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 10px;text-align:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:32px;color:#1127D2;line-height:1;">${escHtml(facilityIcon(f.name))}</span>
            <div style="font-size:11px;color:rgba(255,255,255,0.8);line-height:1.3;">${escHtml(f.name)}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Nearby locations -->
      ${nearbyLocations.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Nearby</h3>
        <div style="display:flex;flex-direction:column;gap:0;">
          ${nearbyLocations.map((l, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${i < nearbyLocations.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : ''}">
            <span style="font-size:13px;color:rgba(255,255,255,0.75);">📍 ${escHtml(l.name)}</span>
            ${l.distance ? `<span style="font-size:12px;color:rgba(255,255,255,0.4);white-space:nowrap;margin-left:8px;">${escHtml(l.distance)}</span>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Description -->
      ${project.description ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">About</h3>
        <div id="proj-desc" style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${sanitizeHtml(project.description)}</div>
        <button id="proj-desc-more" onclick="(function(){var d=document.getElementById('proj-desc');d.style.webkitLineClamp='unset';d.style.overflow='visible';d.style.display='block';document.getElementById('proj-desc-more').style.display='none';})()" style="background:none;border:none;color:rgba(255,255,255,0.45);font-size:12px;padding:4px 0 0;cursor:pointer;font-family:'Inter',sans-serif;">Read more</button>
      </div>` : ''}

      <!-- Brochure download (gate behind lead capture) -->
      ${project.brochure_url ? `
      <div style="margin-bottom:20px;">
        <button data-brochure="${escAttr(project.brochure_url)}" data-name="${escAttr(project.name)}" onclick="openLeadForBrochure(this.dataset.name, this.dataset.brochure)" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;box-sizing:border-box;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Get Brochure — Free
        </button>
      </div>` : ''}

    </div>

    <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
      <button data-name="${escAttr(project.name)}" onclick="openLead(this.dataset.name)" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
      <button onclick="_openProjectMortgage()" style="flex:1;padding:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Mortgage</button>
      ${currentAgent?.whatsapp ? `<a href="https://wa.me/${encodeURIComponent(currentAgent.whatsapp.replace(/[^0-9]/g,''))}?text=${encodeURIComponent('Hi, I\'m interested in ' + project.name + ' — can you tell me more?')}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;">WhatsApp</a>` : ''}
    </div>`;

  // Gallery scroll counter
  if (totalSlides > 1) {
    const galleryEl = document.getElementById('proj-gallery');
    const counterEl = document.getElementById('proj-gallery-count');
    if (galleryEl && counterEl) {
      galleryEl.addEventListener('scroll', () => {
        const idx = Math.round(galleryEl.scrollLeft / galleryEl.clientWidth);
        counterEl.textContent = `${idx + 1} / ${totalSlides}`;
      }, { passive: true });
    }
  }

}
