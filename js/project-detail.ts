// ==========================================
// OFF-PLAN PROJECT DETAIL (lazy loaded)
// ==========================================
import { supabase } from './config';
import { currentAgent } from './state';
import { escAttr, escHtml, optimizeImg } from './utils';

interface Milestone {
  name?: string | null;
  percentage?: number | null;
}

interface PaymentPlan {
  booking?: number | null;
  booking_percentage?: number | null;
  construction?: number | null;
  construction_percentage?: number | null;
  handover?: number | null;
  handover_percentage?: number | null;
}

interface PpPlan {
  title?: string | null;
  milestones?: Milestone[] | null;
  heading_percentages?: Record<string, string | number | null>;
}

interface AvailableUnit {
  bedroom?: string | number | null;
  property_types?: string | null;
  lowest_area?: number | null;
  area_sqft?: number | null;
  area?: number | null;
  lowest_price?: number | null;
  price?: number | null;
  min_price?: number | null;
  available_units_count?: number | null;
}

interface NearbyLocation {
  name: string;
  distance?: string | null;
}

interface Facility {
  name: string;
}

interface ImagesCategorized {
  interior?: string[] | null;
  exterior?: string[] | null;
  general?: string[] | null;
}

interface Developer {
  name?: string | null;
  logo_url?: string | null;
  website?: string | null;
}

interface Project {
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  location?: string | null;
  district_name?: string | null;
  area?: string | null;
  cover_image_url?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  min_area_sqft?: number | null;
  max_area_sqft?: number | null;
  completion_date?: string | null;
  handover_percentage?: number | null;
  payment_plan?: unknown;
  payment_plan_detail?: unknown;
  gallery_images?: string[] | null;
  floor_plan_urls?: string[] | null;
  available_units?: unknown;
  facilities?: Facility[] | null;
  nearby_locations?: NearbyLocation[] | null;
  brochure_url?: string | null;
  images_categorized?: unknown;
  status?: string | null;
  property_types?: string[] | null;
  beds?: string | null;
  lat?: number | null;
  lng?: number | null;
  developers?: Developer | null;
}

let _detailProject: Project | null = null;

// Lazy-inject Cormorant Garamond + DM Sans only when project detail first opens.
// Zero impact on page load — fonts load after user initiates the action.
// Deliberate override of CLAUDE.md "no new Google Fonts on page load" rule.
// See DECISIONS.md 2026-04-07 entry for rationale.
let _pdFontsLoaded = false;
function _injectPdFonts(): void {
  if (_pdFontsLoaded) return;
  _pdFontsLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&family=DM+Sans:wght@300;400;500&display=swap';
  document.head.appendChild(link);
}

// Extend closeDetail to clean up pd-mode class (no-op when property-detail is open).
{
  const _orig = window.closeDetail;
  window.closeDetail = () => {
    document.getElementById('detail-overlay')?.classList.remove('pd-mode');
    _orig?.();
  };
}

const fmtPrice = (n: number | null | undefined): string | null =>
  n ? `AED\u00a0${Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 })}` : null;

const fmtCompact = (n: number | null | undefined): string | null => {
  if (!n) return null;
  const num = Number(n);
  if (num >= 1_000_000) return `AED\u00a0${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `AED\u00a0${Math.round(num / 1_000)}K`;
  return `AED\u00a0${num.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
};

// Strip dangerous tags from trusted CRM HTML using the browser's own HTML parser.
// DOM-based approach handles javascript: URLs, SVG XSS, and malformed markup that
// regex patterns miss.
const sanitizeHtml = (html: string | null | undefined): string => {
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

const statusLabel = (s: string | null | undefined): string =>
  s === 'under_construction' ? 'Under Construction'
  : s === 'completed' ? 'Completed'
  : 'Off Plan';

// Filter low-quality thumbnail images by URL pattern
const isThumb = (u: string): boolean => /[/_-]thumb(nail)?[/_.-]/i.test(u);

// Map facility names to Material Symbols icon strings
function facilityIcon(name: string | null | undefined): string {
  const n = (name ?? '').toLowerCase();
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

// Lightbox — lazy-loaded from project-lightbox.ts on first image tap
let _lbMod: Promise<typeof import('./project-lightbox')> | null = null;
function getLightbox() {
  if (!_lbMod) _lbMod = import('./project-lightbox');
  return _lbMod;
}

window._lbStep = (dir: number) => { void getLightbox().then(m => m.lbStep(dir)); };
window.openProjLightbox = (idx: number) => { void getLightbox().then(m => m.openProjLightbox(idx)); };
window.closeProjLightbox = () => { void getLightbox().then(m => m.closeProjLightbox()); };

// Lazy-load Google Maps iframe when user taps "Show Map"
window._loadDetailMap = (container: HTMLElement) => {
  if (!container) return;
  const lat = container.dataset.maplat;
  const lng = container.dataset.maplng;
  if (!lat || !lng) return;
  const src = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  container.innerHTML = `<iframe src="${src}" width="100%" height="240" style="border:0;border-radius:8px;display:block;" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" title="Project location map"></iframe>`;
};

export async function openProjectDetail(projectSlug: string): Promise<void> {
  const sheet = document.getElementById('detail-sheet');
  const overlay = document.getElementById('detail-overlay');
  if (!sheet || !overlay) return;

  // Show loading state
  sheet.innerHTML = `
    <div style="text-align:center;padding:80px 24px;color:#8a8780;font-size:14px;font-family:'DM Sans',sans-serif;">Loading project\u2026</div>`;
  overlay.classList.add('open', 'pd-mode');
  document.body.style.overflow = 'hidden';
  // Hide property-detail's CTA bar — project detail has its own inline sticky bar
  const ctaBar = document.getElementById('detail-cta-bar');
  if (ctaBar) ctaBar.style.display = 'none';
  // Hide profile sticky CTA bar (WhatsApp/Contact Me) — save current display to restore on close
  const stickyCta = document.getElementById('sticky-cta') as HTMLElement | null;
  if (stickyCta) {
    stickyCta.dataset.prevDisplay = stickyCta.style.display;
    stickyCta.style.display = 'none';
  }

  const { data: project, error } = await supabase
    .from('projects')
    .select('slug,name,description,location,district_name,area,cover_image_url,min_price,max_price,min_area_sqft,max_area_sqft,completion_date,handover_percentage,payment_plan,payment_plan_detail,gallery_images,floor_plan_urls,available_units,facilities,nearby_locations,brochure_url,images_categorized,status,property_types,beds,lat,lng,developers(name,logo_url,website)')
    .eq('slug', projectSlug)
    .single();

  if (error || !project) {
    sheet.innerHTML = `
      <div style="text-align:center;padding:80px 24px;color:#8a8780;font-size:14px;font-family:'DM Sans',sans-serif;">Project not found.</div>`;
    return;
  }

  const dev = (project.developers ?? {}) as Developer;
  _detailProject = project as unknown as Project;
  window._openProjectMortgage = () => {
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
  const minP = fmtPrice(project.min_price as number | null);
  const maxP = fmtPrice(project.max_price as number | null);
  const priceStr = minP && maxP ? `${minP} \u2013 ${maxP}` : minP ? `From ${minP}` : (maxP ?? '');
  void priceStr; // used in template below
  const loc = (project.district_name ?? project.location ?? project.area ?? '') as string;
  const types = Array.isArray(project.property_types) && project.property_types.length
    ? (project.property_types as string[]).join(', ') : '';
  void types;
  const areaStr = project.min_area_sqft && project.max_area_sqft
    ? `${Number(project.min_area_sqft).toLocaleString()} \u2013 ${Number(project.max_area_sqft).toLocaleString()} sqft`
    : project.min_area_sqft
      ? `From ${Number(project.min_area_sqft).toLocaleString()} sqft`
      : '';
  void areaStr;

  // Gallery: prefer images_categorized (interior + exterior), fallback to gallery_images
  const cat = project.images_categorized as ImagesCategorized | null;
  let galleryImgs: string[] = [];
  if (cat && (cat.interior?.length || cat.exterior?.length)) {
    const combined = [...(cat.interior ?? []), ...(cat.exterior ?? [])];
    galleryImgs = combined.filter((u): u is string => Boolean(u) && u !== project.cover_image_url);
  } else if (Array.isArray(project.gallery_images) && project.gallery_images.length) {
    const sitePlanUrls = new Set(cat?.general ?? []);
    galleryImgs = (project.gallery_images as string[]).filter(u => u && u !== project.cover_image_url && !sitePlanUrls.has(u));
  }

  // Filter thumbnail images; set lightbox array
  galleryImgs = galleryImgs.filter(u => !isThumb(u));
  const lbImages = project.cover_image_url ? [project.cover_image_url, ...galleryImgs] : [...galleryImgs];
  // Pre-set lightbox images so they're ready when user taps a photo
  void getLightbox().then(m => m.setLightboxImages(lbImages));

  // Site plan images (from images_categorized.general, or legacy floor_plan_urls)
  const sitePlanImgs: string[] = (cat?.general?.filter((x): x is string => Boolean(x)) ?? []).length
    ? (cat!.general!.filter((x): x is string => Boolean(x)))
    : (Array.isArray(project.floor_plan_urls) ? (project.floor_plan_urls as string[]).filter(Boolean) : []);

  const totalSlides = (imgSrc ? 1 : 0) + galleryImgs.length;

  // Facilities (amenities strip)
  const facilities: Facility[] = Array.isArray(project.facilities) && project.facilities.length
    ? project.facilities as unknown as Facility[] : [];

  // Nearby locations
  const nearbyLocations: NearbyLocation[] = Array.isArray(project.nearby_locations) && project.nearby_locations.length
    ? project.nearby_locations as unknown as NearbyLocation[] : [];

  // Available units
  const availableUnitsRaw = project.available_units;
  const units: AvailableUnit[] = availableUnitsRaw && typeof availableUnitsRaw === 'object'
    ? (Array.isArray(availableUnitsRaw) ? availableUnitsRaw as AvailableUnit[] : ((availableUnitsRaw as Record<string, unknown>).units as AvailableUnit[] | undefined) ?? [])
    : [];

  // Payment plan — prefer payment_plan_detail (new_payment_plans array) > legacy payment_plan JSONB > handover_percentage
  let bookingPct: number | null = null;
  let constructionPct: number | null = null;
  let handoverPct: number | null = null;
  let paymentPlanTitle: string | null = null;
  let paymentMilestones: Milestone[] | null = null;

  const ppDetail = project.payment_plan_detail;
  const ppPlan: PpPlan | null = Array.isArray(ppDetail) && ppDetail.length > 0 ? ppDetail[0] as PpPlan : null;

  if (ppPlan && typeof ppPlan === 'object') {
    paymentPlanTitle = ppPlan.title ?? null;
    paymentMilestones = Array.isArray(ppPlan.milestones) && ppPlan.milestones.length ? ppPlan.milestones as Milestone[] : null;
    const hp = ppPlan.heading_percentages;
    if (hp && typeof hp === 'object') {
      for (const [k, v] of Object.entries(hp)) {
        const key = k.toLowerCase();
        const val = v !== null && v !== undefined ? parseInt(String(v), 10) : null;
        if (key.includes('booking')) bookingPct = val;
        else if (key.includes('construction')) constructionPct = val;
        else if (key.includes('completion') || key.includes('handover')) handoverPct = val;
      }
    }
  } else {
    const pp = project.payment_plan;
    if (pp && typeof pp === 'object' && !Array.isArray(pp)) {
      const ppObj = pp as PaymentPlan;
      bookingPct = ppObj.booking ?? ppObj.booking_percentage ?? null;
      constructionPct = ppObj.construction ?? ppObj.construction_percentage ?? null;
      handoverPct = ppObj.handover ?? ppObj.handover_percentage ?? null;
    } else if (project.handover_percentage != null) {
      handoverPct = project.handover_percentage as number;
      bookingPct = 10;
      constructionPct = Math.max(0, 100 - bookingPct - handoverPct);
    }
  }
  void paymentPlanTitle;
  const hasPaymentPlan = bookingPct != null || constructionPct != null || handoverPct != null;

  const completionShort = project.completion_date
    ? new Date(project.completion_date as string).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    : null;

  const statCells: Array<{ label: string; value: string }> = [];
  if (project.min_price) statCells.push({ label: 'From', value: fmtCompact(project.min_price as number) ?? '' });
  if (completionShort) statCells.push({ label: 'Handover', value: completionShort });
  if (project.min_area_sqft) statCells.push({ label: 'Size from', value: `${Number(project.min_area_sqft).toLocaleString('en-AE', { maximumFractionDigits: 0 })}\u00a0sqft` });
  if (hasPaymentPlan) {
    const parts = [bookingPct, constructionPct, handoverPct].filter((v): v is number => v != null);
    statCells.push({ label: 'Pay plan', value: parts.join('/') });
  }
  const showStatsBar = statCells.length >= 2;
  void statCells; void showStatsBar;

  _injectPdFonts();
  sheet.innerHTML = `
    <div style="position:relative;flex-shrink:0;height:300px;overflow:hidden;background:#d6d2c8;">
      ${imgSrc ? `<img src="${escAttr(imgSrc)}" alt="${escAttr(project.name ?? '')}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="eager" data-managed>` : ''}
      <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(26,25,22,0.75) 0%,rgba(26,25,22,0.2) 55%,transparent 80%);pointer-events:none;"></div>
      <button data-title="${escAttr(project.name ?? '')}" data-action="shareDetail" style="position:absolute;top:max(60px,calc(env(safe-area-inset-top) + 14px));right:16px;width:40px;height:40px;border-radius:50%;background:rgba(245,242,236,0.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(245,242,236,0.3);color:#f5f2ec;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
      <div style="position:absolute;bottom:0;left:0;right:0;padding:16px 20px 20px;">
        ${loc ? `<div style="font-family:'DM Sans',sans-serif;font-size:11px;font-weight:400;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,242,236,0.7);margin-bottom:6px;">${escHtml(loc)}</div>` : ''}
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;line-height:1.2;color:#f5f2ec;margin:0 0 10px;">${escHtml(project.name ?? '')}</h2>
        <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;">
          ${priceStr ? `<span style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:#f5f2ec;">${escHtml(priceStr)}</span>` : ''}
          ${areaStr ? `<span style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:300;color:rgba(245,242,236,0.6);">${escHtml(areaStr)}</span>` : ''}
          ${completionShort ? `<span style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:300;color:rgba(245,242,236,0.6);">Handover ${escHtml(completionShort)}</span>` : ''}
        </div>
      </div>
    </div>

    ${galleryImgs.length > 0 ? `
    <div id="proj-gallery" style="display:flex;gap:3px;overflow-x:auto;scrollbar-width:none;padding:3px;background:#e0dbd0;-webkit-overflow-scrolling:touch;">
      ${galleryImgs.map((u, i) => { const lbIdx = (imgSrc ? 1 : 0) + i; return `<div style="flex:0 0 auto;width:76px;height:64px;cursor:pointer;border-radius:4px;overflow:hidden;" data-action="openProjLightbox" data-dir="${lbIdx}"><img src="${escAttr(optimizeImg(u, 160))}" alt="${escAttr(project.name ?? '')} photo ${i+2}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;" loading="lazy" data-managed></div>`; }).join('')}
    </div>` : ''}

    <div style="background:#f5f2ec;padding:0 0 80px;">

      <div style="padding:14px 20px 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span style="font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;padding:4px 12px;border-radius:99px;background:rgba(26,25,22,0.07);color:#1a1916;letter-spacing:0.04em;">${escHtml(statusLabel(project.status as string | null))}</span>
        ${dev.name ? `<div style="display:flex;align-items:center;gap:8px;">${dev.logo_url ? `<img src="${escAttr(optimizeImg(dev.logo_url, 60))}" alt="${escAttr(dev.name ?? '')}" style="width:26px;height:26px;border-radius:4px;object-fit:contain;background:#eae6de;" data-managed>` : ''}<span style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:400;color:#8a8780;">${escHtml(dev.name ?? '')}</span></div>` : ''}
      </div>

      ${hasPaymentPlan ? `
      <div style="margin:14px 20px 0;background:#eae6de;border-radius:14px;padding:16px;">
        <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.09em;color:#8a8780;margin-bottom:12px;">Payment Plan</div>
        <div style="display:flex;margin-bottom:12px;">
          ${bookingPct != null ? `<div style="flex:1;text-align:center;"><div style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;color:#1a1916;line-height:1;">${bookingPct}%</div><div style="font-family:'DM Sans',sans-serif;font-size:10px;color:#8a8780;margin-top:3px;">Booking</div></div>` : ''}
          ${constructionPct != null ? `<div style="flex:1;text-align:center;border-left:1px solid rgba(26,25,22,0.1);"><div style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;color:#1a1916;line-height:1;">${constructionPct}%</div><div style="font-family:'DM Sans',sans-serif;font-size:10px;color:#8a8780;margin-top:3px;">Construction</div></div>` : ''}
          ${handoverPct != null ? `<div style="flex:1;text-align:center;border-left:1px solid rgba(26,25,22,0.1);"><div style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;color:#1a1916;line-height:1;">${handoverPct}%</div><div style="font-family:'DM Sans',sans-serif;font-size:10px;color:#8a8780;margin-top:3px;">Handover</div></div>` : ''}
        </div>
        <div style="height:5px;border-radius:3px;background:rgba(26,25,22,0.1);overflow:hidden;display:flex;">
          ${bookingPct != null ? `<div style="width:${bookingPct}%;background:#1a1916;"></div>` : ''}
          ${constructionPct != null ? `<div style="width:${constructionPct}%;background:rgba(26,25,22,0.35);"></div>` : ''}
          ${handoverPct != null ? `<div style="width:${handoverPct}%;background:rgba(26,25,22,0.12);"></div>` : ''}
        </div>
        ${paymentMilestones?.length ? `
        <div style="margin-top:12px;border-top:1px solid rgba(26,25,22,0.08);padding-top:10px;display:flex;flex-direction:column;gap:7px;">
          ${paymentMilestones.map(m => `<div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="font-family:'DM Sans',sans-serif;font-size:12px;color:#8a8780;">${escHtml(m.name ?? '')}</span><span style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;color:#1a1916;">${escHtml(String(m.percentage ?? ''))}%</span></div>`).join('')}
        </div>` : ''}
      </div>` : ''}

      ${units.length ? `
      <div style="margin:14px 20px 0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.09em;color:#8a8780;margin-bottom:10px;">Available Units</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${units.map(u => { const typeLabel = u.bedroom ? `${u.bedroom}\u00a0BR` : (u.property_types ?? 'Unit'); const areaVal = u.lowest_area ?? u.area_sqft ?? u.area; const priceVal = u.lowest_price ?? u.price ?? u.min_price; const avail = u.available_units_count; const availText = avail != null ? (avail === 0 ? 'Sold out' : `${avail} left`) : ''; const availColor = avail != null ? (avail === 0 ? '#8a8780' : (avail <= 5 ? '#b84c3a' : '#3a7c5a')) : ''; return `<div style="background:#eae6de;border-radius:10px;padding:12px;"><div style="font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:300;color:#1a1916;line-height:1.1;">${escHtml(String(typeLabel))}</div>${areaVal ? `<div style="font-family:'DM Sans',sans-serif;font-size:11px;color:#8a8780;margin-top:4px;">${Number(areaVal).toLocaleString('en-AE',{maximumFractionDigits:0})}\u00a0sqft</div>` : ''}${priceVal ? `<div style="font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#1a1916;margin-top:4px;">AED\u00a0${Number(priceVal).toLocaleString('en-AE',{maximumFractionDigits:0})}</div>` : ''}${availText ? `<div style="font-family:'DM Sans',sans-serif;font-size:10px;margin-top:4px;color:${availColor};">${escHtml(availText)}</div>` : ''}</div>`; }).join('')}
        </div>
      </div>` : ''}

      ${sitePlanImgs.length ? `
      <div style="margin:14px 20px 0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.09em;color:#8a8780;margin-bottom:10px;">Site Plan</div>
        ${sitePlanImgs.map((u, i) => `<img src="${escAttr(optimizeImg(u, 800))}" alt="Site plan ${i+1}" style="width:100%;border-radius:10px;background:#eae6de;display:block;${i > 0 ? 'margin-top:8px;' : ''}" loading="lazy" data-managed data-onerror="hide">`).join('')}
      </div>` : ''}

      ${facilities.length ? `
      <div style="margin:14px 20px 0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.09em;color:#8a8780;margin-bottom:10px;">Amenities</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${facilities.map(f => `<div style="background:#eae6de;border-radius:10px;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;"><span class="material-symbols-outlined" style="font-size:26px;color:rgba(26,25,22,0.45);line-height:1;">${escHtml(facilityIcon(f.name))}</span><div style="font-family:'DM Sans',sans-serif;font-size:11px;color:#1a1916;line-height:1.3;">${escHtml(f.name)}</div></div>`).join('')}
        </div>
      </div>` : ''}

      ${nearbyLocations.length ? `
      <div style="margin:14px 20px 0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.09em;color:#8a8780;margin-bottom:8px;">Nearby</div>
        <div style="background:#eae6de;border-radius:12px;overflow:hidden;">
          ${nearbyLocations.map((l, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;${i < nearbyLocations.length - 1 ? 'border-bottom:1px solid rgba(26,25,22,0.07);' : ''}"><span style="font-family:'DM Sans',sans-serif;font-size:13px;color:#1a1916;">${escHtml(l.name)}</span>${l.distance ? `<span style="font-family:'DM Sans',sans-serif;font-size:12px;color:#8a8780;">${escHtml(l.distance)}</span>` : ''}</div>`).join('')}
        </div>
      </div>` : ''}

      ${(project.lat && project.lng) ? `
      <div style="margin:14px 20px 0;" data-mapq="${escAttr(encodeURIComponent(`${project.name ?? ''} ${project.district_name ?? project.location ?? project.area ?? ''} Dubai`))}" data-maplat="${escAttr(String(project.lat))}" data-maplng="${escAttr(String(project.lng))}">
        <button data-action="loadDetailMap" style="width:100%;padding:13px;background:#eae6de;border:1px solid rgba(26,25,22,0.1);border-radius:12px;font-family:'DM Sans',sans-serif;font-size:13px;color:#8a8780;cursor:pointer;text-align:center;">\u{1F4CD} Show on Map</button>
      </div>` : ''}

      ${project.description ? `
      <div style="margin:14px 20px 0;">
        <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.09em;color:#8a8780;margin-bottom:8px;">About</div>
        <div id="proj-desc" style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.7;color:#1a1916;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">${sanitizeHtml(project.description as string)}</div>
        <button id="proj-desc-more" data-action="expandDesc" style="background:none;border:none;font-family:'DM Sans',sans-serif;font-size:12px;color:#8a8780;padding:6px 0 0;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(138,135,128,0.4);">Read more</button>
      </div>` : ''}

      ${project.brochure_url ? `
      <div style="margin:14px 20px 0;">
        <button data-brochure="${escAttr(project.brochure_url as string)}" data-name="${escAttr(project.name ?? '')}" data-action="openLeadForBrochure" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:#eae6de;border:1px solid rgba(26,25,22,0.1);border-radius:12px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:400;color:#1a1916;cursor:pointer;box-sizing:border-box;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Get Brochure \u2014 Free</button>
      </div>` : ''}

    </div>

    <div style="position:sticky;bottom:0;background:#f5f2ec;border-top:1px solid rgba(26,25,22,0.08);padding:12px 16px calc(12px + env(safe-area-inset-bottom));">
      <button data-name="${escAttr(project.name ?? '')}" data-action="openLeadForProperty" style="display:block;width:100%;padding:15px;background:#d4e84a;border:none;border-radius:99px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;color:#1a1916;cursor:pointer;margin-bottom:8px;box-sizing:border-box;">Enquire Now</button>
      <div style="display:flex;gap:8px;">
        <button data-action="openProjectMortgage" style="flex:1;padding:12px;background:#eae6de;border:1px solid rgba(26,25,22,0.1);border-radius:99px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;color:#1a1916;cursor:pointer;">Mortgage</button>
        ${currentAgent?.whatsapp ? `<a href="https://wa.me/${encodeURIComponent(currentAgent.whatsapp.replace(/[^0-9]/g,''))}?text=${encodeURIComponent(`Hi, I'm interested in ${project.name ?? ''} \u2014 can you tell me more?`)}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.25);border-radius:99px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;color:#25d366;text-decoration:none;">WhatsApp</a>` : ''}
      </div>
    </div>`;

  // Gallery scroll counter (no-op if proj-gallery-count is absent in new template)
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

window.openProjectDetail = openProjectDetail;
