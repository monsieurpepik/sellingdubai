// ==========================================
// PROPERTY DETAIL VIEW
// ==========================================
import { escHtml, escAttr } from './utils.js';
import { logEvent } from './analytics.js';
import { currentAgent, allProperties } from './state.js';
import { applyCurrentFilters } from './filters.js';

let currentDetailProp = null;

// Stable lookup by property ID — immune to filter changes between render and click
window.openPropertyById = function(propId) {
  const p = allProperties.find(prop => String(prop.id) === String(propId));
  if (!p) return;
  currentDetailProp = p;
  renderDetailView(p);
  const ctaBar = document.getElementById('detail-cta-bar');
  if (ctaBar) ctaBar.style.display = '';
  document.getElementById('detail-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  logEvent('link_click', { link_type: 'property_detail', property: p.title });
};

window.openPropertyDetail = function(propIndex) {
  const props = applyCurrentFilters();
  const p = props[propIndex];
  if (!p) return;
  currentDetailProp = p;
  renderDetailView(p);
  const ctaBar = document.getElementById('detail-cta-bar');
  if (ctaBar) ctaBar.style.display = '';
  document.getElementById('detail-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  logEvent('link_click', { link_type: 'property_detail', property: p.title });
};

window.closeDetail = function() {
  document.getElementById('detail-overlay').classList.remove('open');
  // Keep scroll locked only if the properties overlay is still open behind this
  const propOverlayOpen = document.getElementById('prop-overlay')?.classList.contains('open');
  document.body.style.overflow = propOverlayOpen ? 'hidden' : '';
  currentDetailProp = null;
  if (currentAgent) history.pushState(null, '', '/a/' + currentAgent.slug);
};

function renderDetailView(p) {
  window._currentProperty = p;
  const sheet = document.getElementById('detail-sheet');

  const extras = p.additional_photos || [];
  const allImages = [p.image_url, ...extras].filter(Boolean);

  // Gallery
  let galleryHtml = '';
  if (allImages.length > 0) {
    const heroImg = `<img id="detail-hero-img" class="detail-hero" src="${escAttr(allImages[0])}" alt="${escAttr(p.title)}" loading="lazy" onclick="openPhotoViewer(window._currentDetailHeroIdx||0)" style="cursor:pointer" onerror="handleImgError(this)">`;
    if (allImages.length > 1) {
      const gridImgs = allImages.slice(1, 5).map((url, i) =>
        `<img src="${escAttr(url)}" alt="" loading="lazy" onclick="swapDetailHero(${i + 1})" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:pointer" onerror="handleImgError(this)">`
      ).join('');
      const showAllBtn = `<button class="detail-show-all" onclick="openFullGallery()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>SHOW ALL PHOTOS</button>`;
      galleryHtml = `<div class="detail-gallery-wrap">${heroImg}<div class="detail-gallery">${gridImgs}</div>${showAllBtn}</div>`;
    } else {
      galleryHtml = heroImg;
    }
  }

  window._currentDetailImages = allImages;
  window._currentDetailHeroIdx = 0;

  const breadcrumbHtml = p.title ? `<div class="detail-breadcrumb">${escHtml(p.title)}</div>` : '';
  const titleAboveHtml = p.title ? `<div class="detail-title-above">${escHtml(p.title)}</div>` : '';

  let priceText = '';
  if (p.price) {
    const ps = escHtml(p.price);
    priceText = /AED/i.test(ps) ? ps : `AED ${ps}`;
  }

  const specItems = [];
  if (p.bedrooms) specItems.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7v11a1 1 0 001 1h16a1 1 0 001-1V7"/><path d="M21 11H3V9a2 2 0 012-2h14a2 2 0 012 2v2z"/></svg>${p.bedrooms} Bed${p.bedrooms > 1 ? 's' : ''}</div>`);
  if (p.bathrooms) specItems.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M6 12V5a2 2 0 012-2h1a2 2 0 012 2v1"/></svg>${p.bathrooms} Bath${p.bathrooms > 1 ? 's' : ''}</div>`);
  if (p.area_sqft) specItems.push(`<div class="detail-spec"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>${p.area_sqft.toLocaleString()} sqft</div>`);
  const specsRowHtml = specItems.length > 0 ? `<div class="detail-specs-row">${specItems.join('<div class="detail-spec-divider"></div>')}</div>` : '';

  // Property details + amenities card
  let infoCardHtml = '';
  const detailItems = [];
  if (p.property_type) detailItems.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1m-1 4h1m-1 4h1"/></svg>${escHtml(p.property_type)}</div>`);
  if (p.land_area) detailItems.push(`<div class="detail-info-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="0" stroke-dasharray="4 2"/></svg>${p.land_area} m² Land</div>`);

  const amenityItems = (p.features || []).map(f => {
    const fl = f.toLowerCase();
    let icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    if (fl.includes('view') || fl.includes('landmark') || fl.includes('panoram')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><circle cx="12" cy="14" r="3"/></svg>';
    else if (fl.includes('pool')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><path d="M2 19c3 0 3-2 6-2s3 2 6 2 3-2 6-2"/><circle cx="8" cy="8" r="2"/><path d="M16 8h-4l-2 3"/></svg>';
    else if (fl.includes('gym') || fl.includes('fitness')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="8" width="4" height="8" rx="1"/><rect x="18" y="8" width="4" height="8" rx="1"/><path d="M6.5 12h11"/></svg>';
    else if (fl.includes('garden')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22V12"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/><path d="M4 15c0-3.31 3.58-6 8-6s8 2.69 8 6"/></svg>';
    else if (fl.includes('jacuzzi') || fl.includes('spa')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"/><path d="M8 7c0-1 .5-2 2-2s2 1 2 0 .5-2 2-2 2 1 2 2"/></svg>';
    else if (fl.includes('bbq') || fl.includes('barbecue')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="10" r="6"/><path d="M12 16v4"/><path d="M8 20h8"/><path d="M9 7c1 1 2 1 3 0s2-1 3 0"/></svg>';
    else if (fl.includes('parking') || fl.includes('garage')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg>';
    else if (fl.includes('balcony')) icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 15h18"/><path d="M3 15v5h18v-5"/><path d="M9 15V5h6v10"/></svg>';
    return `<div class="detail-info-item">${icon}${escHtml(f)}</div>`;
  });

  if (detailItems.length > 0 || amenityItems.length > 0) {
    infoCardHtml = `<div class="detail-info-card">`;
    if (detailItems.length > 0) {
      infoCardHtml += `<div class="detail-info-title">Property Details</div><div class="detail-info-row">${detailItems.join('')}</div>`;
    }
    if (detailItems.length > 0 && amenityItems.length > 0) {
      infoCardHtml += `<div class="detail-info-divider"></div>`;
    }
    if (amenityItems.length > 0) {
      infoCardHtml += `<div class="detail-info-title">Amenities</div><div class="detail-info-row">${amenityItems.join('')}</div>`;
    }
    infoCardHtml += `</div>`;
  }

  const descHtml = p.description
    ? `<div class="detail-description-card"><div class="detail-section-title">Description</div><div class="detail-description">${escHtml(p.description)}</div></div>`
    : '';

  let locationHtml = '';
  if (p.location) {
    const mapQ = encodeURIComponent(p.location + ', Dubai, UAE');
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQ}`;
    locationHtml = `<div class="detail-location-card"><div class="detail-section-title">Location</div>
      <div class="detail-location-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="#c9a96e" style="vertical-align:-2px;margin-right:6px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${escHtml(p.location)}, Dubai, UAE</div>
      <div class="detail-map detail-map-clickable" onclick="window.open('${mapsUrl}','_blank')">
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14000!2d55.27!3d25.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z${mapQ}!5e0!3m2!1sen!2sae!4v1" class="detail-map-iframe" allowfullscreen loading="lazy"></iframe>
        <div class="detail-map-overlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span class="detail-map-label">Open in Maps</span>
        </div>
      </div></div>`;
  }

  let regHtml = '';
  if (p.dld_permit || p.reference_number) {
    regHtml = `<div class="detail-reg-card">
      <div class="detail-info-title">Regulatory Information</div>
      <div class="detail-reg-grid">
        ${p.dld_permit ? `<div><div class="detail-reg-label">Trakheesi Permit</div><div class="detail-reg-value">${escHtml(p.dld_permit)}</div></div>` : ''}
        ${p.reference_number ? `<div><div class="detail-reg-label">Reference</div><div class="detail-reg-value">${escHtml(p.reference_number)}</div></div>` : ''}
        <div><div class="detail-reg-label">Listed</div><div class="detail-reg-value">${new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
      </div>
    </div>`;
  }

  // Cost to Own Calculator
  let costToOwnHtml = '';
  if (p.price) {
    const rawPrice = parseFloat(String(p.price).replace(/[^0-9.]/g, ''));
    if (rawPrice > 0) {
      const dldFee = rawPrice * 0.04;
      const adminFee = rawPrice >= 500000 ? 4200 : 2100;
      const titleDeed = 580;
      const agentComm = rawPrice * 0.021; // 2% + 5% VAT
      const nocFee = 2500; // avg
      const cashTotal = dldFee + adminFee + titleDeed + agentComm + nocFee;

      // Mortgage scenario (80% LTV)
      const loanAmt = rawPrice * 0.8;
      const mortgageReg = loanAmt * 0.0025 + 290;
      const bankFee = loanAmt * 0.01; // ~1% processing fee
      const mortgageTotal = cashTotal + mortgageReg + bankFee;

      const fmtAED = (n) => 'AED ' + Math.round(n).toLocaleString();
      const fmtPct = (n) => (n * 100).toFixed(1) + '%';

      costToOwnHtml = `
      <div class="cost-to-own-card">
        <div class="cost-to-own-title">Cost to Own</div>
        <div class="cost-to-own-subtitle">Estimated transaction costs for this property</div>
        <div class="cost-toggle-row">
          <button class="cost-toggle-btn active" onclick="toggleCostMode(this,'cash')">Cash Purchase</button>
          <button class="cost-toggle-btn" onclick="toggleCostMode(this,'mortgage')">With Mortgage</button>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">DLD Transfer Fee <span class="cost-pct">4%</span></span>
          <span class="cost-row-value">${fmtAED(dldFee)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">DLD Admin Fee</span>
          <span class="cost-row-value">${fmtAED(adminFee)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Title Deed Issuance</span>
          <span class="cost-row-value">${fmtAED(titleDeed)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Agent Commission <span class="cost-pct">2% + VAT</span></span>
          <span class="cost-row-value">${fmtAED(agentComm)}</span>
        </div>
        <div class="cost-row">
          <span class="cost-row-label">Developer NOC</span>
          <span class="cost-row-value">~${fmtAED(nocFee)}</span>
        </div>
        <div class="cost-mortgage-section hidden" id="cost-mortgage-rows">
          <div class="cost-row">
            <span class="cost-row-label">Mortgage Registration <span class="cost-pct">0.25%</span></span>
            <span class="cost-row-value">${fmtAED(mortgageReg)}</span>
          </div>
          <div class="cost-row">
            <span class="cost-row-label">Bank Processing <span class="cost-pct">~1%</span></span>
            <span class="cost-row-value">${fmtAED(bankFee)}</span>
          </div>
        </div>
        <div class="cost-divider"></div>
        <div class="cost-row-total">
          <span class="cost-row-label">Total Estimated Cost</span>
          <span class="cost-row-value" id="cost-total-value">${fmtAED(cashTotal)}</span>
        </div>
        <div class="cost-row-total" style="padding-top:4px;">
          <span class="cost-row-label" style="font-weight:300;font-size:11px;color:rgba(255,255,255,0.3);">% of purchase price</span>
          <span class="cost-row-value" style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);" id="cost-total-pct">${fmtPct(cashTotal / rawPrice)}</span>
        </div>
      </div>`;

      // Store for toggle
      window._costData = { cashTotal, mortgageTotal, rawPrice, fmtAED, fmtPct };
    }
  }

  // Share button
  const shareHtml = `<button class="detail-share-btn" onclick="if(navigator.share)navigator.share({title:'${escAttr(p.title||'')}',url:window.location.href});else if(navigator.clipboard)navigator.clipboard.writeText(window.location.href).then(()=>this.textContent='Link Copied!')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share
  </button>`;

  sheet.innerHTML = `
    <div class="detail-title-bar">${breadcrumbHtml}${titleAboveHtml}</div>
    ${galleryHtml}
    <div class="detail-body">
      <div class="detail-price-row">
        <div>
          <div class="detail-price">${priceText}</div>
          <span class="detail-price-label">${p.listing_type === 'rent' ? 'Per Year' : 'Asking Price'}</span>
        </div>
        ${shareHtml}
      </div>
      ${specsRowHtml}
      ${infoCardHtml}
      ${descHtml}
      ${locationHtml}
      ${regHtml}
      ${costToOwnHtml}
    </div>
  `;
  sheet.scrollTop = 0;

  // Wire bottom CTA buttons
  const waBtn = document.getElementById('detail-wa-btn');
  const inquireBtn = document.getElementById('detail-inquire-btn');
  if (currentAgent && currentAgent.whatsapp) {
    waBtn.style.display = 'flex';
    waBtn.onclick = () => {
      window.open(`https://wa.me/${currentAgent.whatsapp.replace(/[^0-9]/g,'')}?text=${encodeURIComponent('Hi, I\'m interested in: ' + (p.title || 'your property'))}`, '_blank');
      logEvent('whatsapp_tap', { source: 'property_detail', property: p.title });
    };
  } else {
    waBtn.style.display = 'none';
  }
  inquireBtn.onclick = () => openLeadForProperty(p.title);
}

// Cost to Own toggle
window.toggleCostMode = function(btn, mode) {
  // Toggle active state on buttons
  btn.parentElement.querySelectorAll('.cost-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Show/hide mortgage rows
  const mortRows = document.getElementById('cost-mortgage-rows');
  const totalEl = document.getElementById('cost-total-value');
  const pctEl = document.getElementById('cost-total-pct');
  if (!mortRows || !window._costData) return;
  const d = window._costData;
  if (mode === 'mortgage') {
    mortRows.classList.remove('hidden');
    totalEl.textContent = d.fmtAED(d.mortgageTotal);
    pctEl.textContent = d.fmtPct(d.mortgageTotal / d.rawPrice);
  } else {
    mortRows.classList.add('hidden');
    totalEl.textContent = d.fmtAED(d.cashTotal);
    pctEl.textContent = d.fmtPct(d.cashTotal / d.rawPrice);
  }
};
