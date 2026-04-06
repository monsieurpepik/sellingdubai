// ==========================================
// SHARED PROPERTY CARD COMPONENTS
// Pure template functions — no DOM, no state, no network.
// Imported by properties.js (ES module chain via init.js)
// and exposed to dashboard.js via a window bridge in dashboard.html.
// ==========================================

import type { Property } from './state.js';
import { escAttr, escHtml, optimizeImg } from './utils.js';

// ==========================================
// PUBLIC VIEWER CARD
// Used on: index.html (agent public profile)
// ==========================================
export function renderPropertyCard(p: Property, idx: number) {
  const STATUS_MAP = {
    'just_listed': { label: 'Just Listed', css: 'prop-tag-just-listed' },
    'available':   { label: 'Available',   css: 'prop-tag-available' },
    'open_house':  { label: 'Open House',  css: 'prop-tag-open-house' },
    'under_offer': { label: 'Under Offer', css: 'prop-tag-under-offer' },
    'just_sold':   { label: 'Just Sold',   css: 'prop-tag-just-sold' },
    'sold':        { label: 'Sold',        css: 'prop-tag-sold' },
    'rented':      { label: 'Rented',      css: 'prop-tag-rented' },
  };

  const statusKey = (p.status && p.status in STATUS_MAP) ? p.status as keyof typeof STATUS_MAP : 'available';
  const st = STATUS_MAP[statusKey];
  const safeTitle = escAttr(p.title);
  const propId = escAttr(String(p.id || idx));

  const extras = p.additional_photos || [];
  const allImages = p.image_url ? [p.image_url, ...extras.slice(0, 4)] : [];
  let imgSection = '';

  const heartBtn = `<button class="prop-heart" data-action="toggleHeart" aria-label="Save property"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>`;

  if (allImages.length > 1) {
    const slides = allImages.map((url, i) =>
      `<img src="${escAttr(optimizeImg(url))}" alt="${safeTitle}" width="800" height="450" loading="${i === 0 ? 'eager' : 'lazy'}" data-managed>`
    ).join('');
    const dots = allImages.map((_, i) =>
      `<div class="prop-carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></div>`
    ).join('');
    imgSection = `<div class="prop-carousel" data-card-id="${propId}">
      <div class="prop-carousel-track">${slides}</div>
      <div class="prop-carousel-dots">${dots}</div>
      <button class="prop-carousel-nav prev" data-action="slideCarousel" data-prop-id="${propId}" data-dir="-1" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button class="prop-carousel-nav next" data-action="slideCarousel" data-prop-id="${propId}" data-dir="1" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  } else if (allImages.length === 1) {
    imgSection = `<div class="prop-img-wrap">
      <img class="prop-img" src="${escAttr(optimizeImg(allImages[0]))}" alt="${safeTitle}" width="800" height="450" loading="${idx === 0 ? 'eager' : 'lazy'}" data-managed>
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  } else {
    imgSection = `<div class="prop-img-wrap">
      <div class="prop-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  }

  const locationText = p.location ? escHtml(p.location.split(',')[0]) : '\u00A0';
  const locationHtml = `<div class="prop-location">${p.location ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>' : ''}${locationText}</div>`;

  const titleHtml = `<div class="prop-title">${p.title ? escHtml(p.title) : '\u00A0'}</div>`;

  let priceHtml = '';
  if (p.price) {
    const priceStr = escHtml(p.price);
    const hasAED = /AED/i.test(priceStr);
    if (hasAED) {
      const cleanVal = priceStr.replace(/AED\s*/i, '').trim();
      priceHtml = `<div class="prop-price"><span class="prop-price-currency">AED</span><span class="prop-price-value">${cleanVal}</span></div>`;
    } else {
      priceHtml = `<div class="prop-price"><span class="prop-price-value">${priceStr}</span></div>`;
    }
  } else {
    priceHtml = `<div class="prop-price"><span class="prop-price-value">\u00A0</span></div>`;
  }

  const specParts = [];
  if (p.bedrooms) specParts.push(`${p.bedrooms} Bed${p.bedrooms > 1 ? 's' : ''}`);
  if (p.bathrooms) specParts.push(`${p.bathrooms} Bath${p.bathrooms > 1 ? 's' : ''}`);
  if (p.area_sqft) specParts.push(`${p.area_sqft.toLocaleString()} sqft`);
  if (p.property_type) specParts.push(escHtml(p.property_type));
  const specsHtml = `<div class="prop-specs-inline">${specParts.length > 0 ? specParts.join('<span class="spec-dot">·</span>') : '\u00A0'}</div>`;

  const features = p.features || [];
  const featurePillsHtml = features.length > 0
    ? `<div class="prop-card-features">${features.slice(0, 6).map(f => `<span class="prop-card-pill">${escHtml(f)}</span>`).join('')}${features.length > 6 ? `<span class="prop-card-pill prop-card-pill-more">+${features.length - 6}</span>` : ''}</div>`
    : '';
  const descPreview = p.description
    ? `<div class="prop-card-desc">${escHtml(p.description.substring(0, 120))}${p.description.length > 120 ? '...' : ''}</div>`
    : '';

  // Visually-hidden link for screen readers and keyboard navigation
  const viewLink = `<a class="prop-view-link" href="#" data-action="openProperty" data-prop-id="${propId}" aria-label="View details for ${safeTitle}">View details</a>`;

  return `<div class="prop-card" data-title="${safeTitle}" data-id="${propId}" data-action="openProperty" data-prop-id="${propId}">
    ${imgSection}
    <div class="prop-body">
      ${locationHtml}
      ${titleHtml}
      ${priceHtml}
      ${specsHtml}
      ${featurePillsHtml}
      ${descPreview}
      ${viewLink}
    </div>
  </div>`;
}

// ==========================================
// OFF-PLAN / NEW LAUNCH CAROUSEL CARD
// Used on: index.html (agent public profile, off-plan section)
// ==========================================
export function renderOffPlanCard(p: Property) {
  const propId = escAttr(String(p.id));
  const safeTitle = escAttr(p.title);
  const isLaunch = p.listing_type === 'new_launch';
  const typeLabel = isLaunch ? 'NEW LAUNCH' : 'OFF PLAN';
  const typeClass = isLaunch ? 'offplan-badge-launch' : 'offplan-badge-offplan';

  let priceHtml = '';
  if (p.price) {
    const priceStr = escHtml(p.price);
    priceHtml = `<div class="offplan-price"><span class="offplan-price-label">Starting from</span><span class="offplan-price-value">${priceStr}</span></div>`;
  }

  const imgSrc = p.image_url
    ? `<img class="offplan-img" src="${escAttr(optimizeImg(p.image_url))}" alt="${safeTitle}" width="800" height="500" loading="lazy" data-managed>`
    : `<div class="offplan-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`;

  const locationText = p.location ? escHtml(p.location.split(',')[0]) : '';
  const developer = p.developer ? escHtml(p.developer) : '';
  const handover = p.handover_date ? escHtml(p.handover_date) : '';
  const paymentPlan = p.payment_plan ? escHtml(p.payment_plan) : '';

  let metaHtml = '';
  if (paymentPlan || handover) {
    metaHtml = '<div class="offplan-meta">';
    if (paymentPlan) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/></svg>${paymentPlan} Plan</span>`;
    if (handover) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>${handover}</span>`;
    metaHtml += '</div>';
  }

  // Visually-hidden link for screen readers and keyboard navigation
  const viewLink = `<a class="prop-view-link" href="#" data-action="openProperty" data-prop-id="${propId}" aria-label="View details for ${safeTitle}">View details</a>`;

  return `<div class="offplan-card" data-id="${propId}" data-action="openProperty" data-prop-id="${propId}">
    <div class="offplan-img-wrap">
      ${imgSrc}
      <span class="offplan-badge ${typeClass}">${typeLabel}</span>
    </div>
    <div class="offplan-body">
      ${developer ? `<div class="offplan-developer">${developer}</div>` : ''}
      <div class="offplan-title">${escHtml(p.title)}</div>
      ${locationText ? `<div class="offplan-location"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${locationText}</div>` : ''}
      ${priceHtml}
      ${metaHtml}
      ${viewLink}
    </div>
  </div>`;
}

// ==========================================
// ADMIN MANAGEMENT CARD
// Used on: dashboard.html (agent's own listing manager)
// Exposed to dashboard.js (classic IIFE) via window.renderAdminCard bridge in dashboard.html.
// Parameters:
//   p            — property object from manage-properties edge fn
//   idx          — 0-based index in the array (for first/last detection)
//   total        — total array length (for first/last detection)
//   statusLabels — PROP_STATUS_LABELS map from dashboard.js
// ==========================================
export function renderAdminCard(p: Property, idx: number, total: number, statusLabels: Record<string, string>) {
  const safeTitle = escAttr(p.title || '');
  const safeId = escAttr(String(p.id));
  const status = p.status || 'available';
  const statusLabel = statusLabels[status] || status;
  const isFirst = idx === 0;
  const isLast = idx === total - 1;

  const thumbHtml = p.image_url
    ? `<img class="prop-thumb" src="${escAttr(optimizeImg(p.image_url, 200))}" alt="${escAttr(p.title || '')}">`
    : '<div class="prop-thumb-placeholder">🏠</div>';

  const metaParts = [];
  if (p.bedrooms != null) metaParts.push(`${p.bedrooms} bed`);
  if (p.property_type) metaParts.push(escHtml(p.property_type));
  if (p.location) metaParts.push(escHtml(p.location));
  const metaHtml = metaParts.join(' · ');

  const statusOptions = Object.entries(statusLabels)
    .map(([v, l]) => `<option value="${escAttr(v)}"${v === status ? ' selected' : ''}>${escHtml(l)}</option>`)
    .join('');

  return `<div class="prop-card">` +
    `<div class="prop-reorder">` +
      `<button class="prop-arrow-btn" data-action="reorderProp" data-prop-id="${safeId}" data-dir="-1"${isFirst ? ' disabled' : ''} title="Move up" aria-label="Move ${safeTitle} up">▲</button>` +
      `<button class="prop-arrow-btn" data-action="reorderProp" data-prop-id="${safeId}" data-dir="1"${isLast ? ' disabled' : ''} title="Move down" aria-label="Move ${safeTitle} down">▼</button>` +
    `</div>` +
    thumbHtml +
    `<div class="prop-body">` +
      `<div class="prop-title-text">${safeTitle}</div>` +
      (p.price ? `<div class="prop-meta">AED ${escHtml(p.price)}${metaHtml ? ` · ${metaHtml}` : ''}</div>` : (metaHtml ? `<div class="prop-meta">${metaHtml}</div>` : '')) +
      `<div class="prop-actions">` +
        (p.is_active ? '<span class="prop-badge prop-badge-live">Live</span>' : '<span class="prop-badge prop-badge-hidden">Hidden · Add DLD Permit to publish</span>') +
        `<span class="prop-badge prop-badge-${escAttr(status)}">${escHtml(statusLabel)}</span>` +
        `<select class="prop-status-select prop-status-${escAttr(status)}" data-action-change="updatePropStatus" data-prop-id="${safeId}">${statusOptions}</select>` +
        `<button class="prop-share-btn" data-action="shareProperty" data-prop-id="${safeId}" aria-label="Share ${safeTitle}">Share</button>` +
        `<button class="prop-edit-btn" data-action="openPropModal" data-prop-id="${safeId}" aria-label="Edit ${safeTitle}">Edit</button>` +
        `<button class="prop-delete-btn" data-action="deleteProp" data-prop-id="${safeId}" aria-label="Delete ${safeTitle}">Delete</button>` +
      `</div>` +
    `</div>` +
  `</div>`;
}
