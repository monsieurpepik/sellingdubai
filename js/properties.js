// ==========================================
// PROPERTY LOADING, RENDERING & CAROUSEL
// ==========================================
import { DEMO_MODE, supabase } from './config.js';
import { escHtml, escAttr } from './utils.js';
import { allProperties, currentFilters } from './state.js';

// Netlify Image CDN — WebP, max width, quality 80
function optimizeImg(url, w = 800) {
  if (!url) return '';
  // Unsplash URLs are not in the Netlify Image CDN allowlist — serve directly
  if (url.includes('images.unsplash.com')) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80&fm=webp`;
}

// ==========================================
// PROPERTY STATUS MAP
// ==========================================
export const STATUS_MAP = {
  'just_listed': { label: 'Just Listed', css: 'prop-tag-just-listed' },
  'available':   { label: 'Available',   css: 'prop-tag-available' },
  'open_house':  { label: 'Open House',  css: 'prop-tag-open-house' },
  'under_offer': { label: 'Under Offer', css: 'prop-tag-under-offer' },
  'just_sold':   { label: 'Just Sold',   css: 'prop-tag-just-sold' },
  'sold':        { label: 'Sold',        css: 'prop-tag-sold' },
  'rented':      { label: 'Rented',      css: 'prop-tag-rented' },
};

// ==========================================
// DEMO DATA (only used when DEMO_MODE = true)
// ==========================================
const DEMO_PHOTOS = [
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80',
  'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80',
  'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&q=80',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80',
  'https://images.unsplash.com/photo-1600573472556-e636c2acda9e?w=800&q=80',
  'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=800&q=80',
  'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80',
];
const DEMO_AMENITIES = [
  ['Landmark View', 'Private Pool', 'Private Garden', 'In-House Gym', 'Barbecue Area', 'Private Jacuzzi'],
  ['Sea View', 'Private Pool', 'Covered Parking', 'Balcony', 'Built-in Wardrobes', 'Central A/C'],
  ['Burj Khalifa View', 'Infinity Pool', 'Smart Home', 'Private Gym', "Maid's Room", 'Walk-in Closet'],
  ['Marina View', 'Private Beach', 'Concierge', 'Covered Parking', "Children's Play Area", 'Sauna'],
  ['Golf Course View', 'Private Pool', "Driver's Room", 'Landscaped Garden', 'Outdoor Kitchen', 'Study Room'],
];
const DEMO_DESCRIPTIONS = [
  'This stunning property offers panoramic views and world-class finishes throughout. Featuring an open-plan living area that flows seamlessly to a private terrace, designer kitchen with premium appliances, and spa-inspired bathrooms. The residence includes dedicated parking, 24/7 concierge service, and access to resort-style amenities.',
  "An exceptional residence in one of Dubai's most sought-after communities. Thoughtfully designed interiors with floor-to-ceiling windows maximize natural light and capture breathtaking views. The property boasts Italian marble flooring, a gourmet kitchen, and generous entertainment spaces perfect for hosting.",
  'Immaculately presented and move-in ready, this property combines luxury living with practical design. High ceilings and an intelligent layout create a sense of space and grandeur. Premium fixtures and fittings throughout, with a private outdoor area ideal for year-round entertaining.',
  'A rare opportunity to own in this prestigious development. This beautifully appointed property features bespoke joinery, smart home automation, and premium finishes in every room. Residents enjoy exclusive access to world-class leisure facilities including pools, gyms, and landscaped gardens.',
];

function injectDemoPhotos(p) {
  if (!DEMO_MODE) return p;
  const seed = (p.title || '').length + (p.id || '').length;
  const result = { ...p };
  if (!result.additional_photos || result.additional_photos.length === 0) {
    const count = 4 + (seed % 3);
    const shuffled = [...DEMO_PHOTOS].sort((a, b) => Math.sin(seed * 9301 + DEMO_PHOTOS.indexOf(a)) - Math.sin(seed * 7919 + DEMO_PHOTOS.indexOf(b)));
    result.additional_photos = shuffled.slice(0, count);
  }
  if (!result.features || result.features.length === 0) {
    result.features = DEMO_AMENITIES[seed % DEMO_AMENITIES.length];
  }
  if (!result.description) {
    result.description = DEMO_DESCRIPTIONS[seed % DEMO_DESCRIPTIONS.length];
  }
  if (!result.property_type) {
    const types = ['Villa', 'Apartment', 'Penthouse', 'Townhouse', 'Duplex'];
    result.property_type = types[seed % types.length];
  }
  if (!result.land_area && (result.property_type || '').toLowerCase().includes('villa')) {
    result.land_area = 3000 + (seed * 500 % 8000);
  }
  return result;
}

// ==========================================
// PROPERTY LOADING
// ==========================================
let propertiesLoaded = false;
let propertiesCache = [];

export async function loadProperties(agentId) {
  if (propertiesLoaded) return propertiesCache;
  const { data: props, error } = await supabase
    .from('properties')
    .select('id,title,image_url,additional_photos,price,location,property_type,bedrooms,bathrooms,area_sqft,features,description,listing_type,status,developer,handover_date,payment_plan,dld_permit,reference_number,sort_order,created_at,is_active')
    .eq('agent_id', agentId)
    .neq('is_active', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[properties] Failed to load properties:', error.message);
    return [];
  }
  propertiesCache = (props || []).map(injectDemoPhotos);
  propertiesLoaded = true;
  return propertiesCache;
}

export { propertiesLoaded };

// ==========================================
// RENDER PROPERTY CARD
// ==========================================
export function renderPropertyCard(p, idx) {
  const st = STATUS_MAP[p.status] || STATUS_MAP['available'];
  const safeTitle = escAttr(p.title);
  const propId = escAttr(String(p.id || idx));

  // Build image carousel or single image
  const extras = p.additional_photos || [];
  const allImages = p.image_url ? [p.image_url, ...extras.slice(0, 4)] : [];
  let imgSection = '';

  // Heart / favorite button
  const heartBtn = `<button class="prop-heart" onclick="event.stopPropagation();toggleHeart(this)" aria-label="Save property"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>`;

  if (allImages.length > 1) {
    const slides = allImages.map((url, i) =>
      `<img src="${escAttr(optimizeImg(url))}" alt="${safeTitle}" width="800" height="450" loading="${i === 0 ? 'eager' : 'lazy'}" onload="this.classList.add('loaded')" onerror="handleImgError(this)">`
    ).join('');
    const dots = allImages.map((_, i) =>
      `<div class="prop-carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></div>`
    ).join('');
    imgSection = `<div class="prop-carousel" data-card-id="${propId}">
      <div class="prop-carousel-track">${slides}</div>
      <div class="prop-carousel-dots">${dots}</div>
      <button class="prop-carousel-nav prev" onclick="event.stopPropagation();slideCarousel('${propId}',-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button class="prop-carousel-nav next" onclick="event.stopPropagation();slideCarousel('${propId}',1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  } else if (allImages.length === 1) {
    imgSection = `<div class="prop-img-wrap">
      <img class="prop-img" src="${escAttr(optimizeImg(allImages[0]))}" alt="${safeTitle}" width="800" height="450" loading="lazy" onload="this.classList.add('loaded')" onerror="handleImgError(this)">
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

  // ALWAYS render every line — empty placeholder if no data — uniform card height
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

  // Desktop-only extras: amenity pills + description preview
  const features = p.features || [];
  const featurePillsHtml = features.length > 0
    ? `<div class="prop-card-features">${features.slice(0, 6).map(f => `<span class="prop-card-pill">${escHtml(f)}</span>`).join('')}${features.length > 6 ? `<span class="prop-card-pill prop-card-pill-more">+${features.length - 6}</span>` : ''}</div>`
    : '';
  const descPreview = p.description
    ? `<div class="prop-card-desc">${escHtml(p.description.substring(0, 120))}${p.description.length > 120 ? '...' : ''}</div>`
    : '';

  // Card layout: image → location → title → price → specs → (desktop: features + desc)
  return `<div class="prop-card" data-title="${safeTitle}" data-id="${propId}" onclick="openPropertyById('${propId}')">
    ${imgSection}
    <div class="prop-body">
      ${locationHtml}
      ${titleHtml}
      ${priceHtml}
      ${specsHtml}
      ${featurePillsHtml}
      ${descPreview}
    </div>
  </div>`;
}

// Heart / favorite toggle
window.toggleHeart = function(btn) {
  btn.classList.toggle('liked');
  btn.classList.remove('pop');
  // Force reflow for re-animation
  void btn.offsetWidth;
  btn.classList.add('pop');
};

// Carousel slide function
window.slideCarousel = function(cardId, dir) {
  const carousel = document.querySelector(`.prop-carousel[data-card-id="${cardId}"]`);
  if (!carousel) return;
  const track = carousel.querySelector('.prop-carousel-track');
  const dots = carousel.querySelectorAll('.prop-carousel-dot');
  const total = dots.length;
  let current = parseInt(carousel.dataset.idx || '0');
  current = (current + dir + total) % total;
  carousel.dataset.idx = current;
  track.style.transform = `translateX(-${current * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === current));
};

// Touch swipe for carousels
document.addEventListener('touchstart', function(e) {
  const carousel = e.target.closest('.prop-carousel');
  if (!carousel) return;
  carousel._touchX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', function(e) {
  const carousel = e.target.closest('.prop-carousel');
  if (!carousel || carousel._touchX === undefined) return;
  const diff = carousel._touchX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 40) {
    const cardId = carousel.dataset.cardId;
    window.slideCarousel(cardId, diff > 0 ? 1 : -1);
  }
  delete carousel._touchX;
}, { passive: true });

// ==========================================
// OFF-PLAN / NEW LAUNCH CAROUSEL CARD
// ==========================================
export function renderOffPlanCard(p) {
  const propId = escAttr(String(p.id));
  const safeTitle = escAttr(p.title);
  const isLaunch = p.listing_type === 'new_launch';
  const typeLabel = isLaunch ? 'NEW LAUNCH' : 'OFF PLAN';
  const typeClass = isLaunch ? 'offplan-badge-launch' : 'offplan-badge-offplan';

  // Price — "Starting from" pattern like Property Finder
  let priceHtml = '';
  if (p.price) {
    const priceStr = escHtml(p.price);
    priceHtml = `<div class="offplan-price"><span class="offplan-price-label">Starting from</span><span class="offplan-price-value">${priceStr}</span></div>`;
  }

  const imgSrc = p.image_url
    ? `<img class="offplan-img" src="${escAttr(optimizeImg(p.image_url))}" alt="${safeTitle}" width="800" height="500" loading="lazy" onerror="handleImgError(this)">`
    : `<div class="offplan-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`;

  const locationText = p.location ? escHtml(p.location.split(',')[0]) : '';
  const developer = p.developer ? escHtml(p.developer) : '';
  const handover = p.handover_date ? escHtml(p.handover_date) : '';
  const paymentPlan = p.payment_plan ? escHtml(p.payment_plan) : '';

  // Meta pills — payment plan + handover (the two things off-plan buyers care about)
  let metaHtml = '';
  if (paymentPlan || handover) {
    metaHtml = '<div class="offplan-meta">';
    if (paymentPlan) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/></svg>${paymentPlan} Plan</span>`;
    if (handover) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>${handover}</span>`;
    metaHtml += '</div>';
  }

  return `<div class="offplan-card" data-id="${propId}" onclick="openPropertyById('${propId}')">
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
    </div>
  </div>`;
}

// ==========================================
// RENDER PROPERTY LIST
// ==========================================
export function renderPropertyList(props) {
  const listEl = document.getElementById('prop-list');
  const countEl = document.getElementById('prop-count');
  if (props.length === 0) {
    const hasFilters = currentFilters.search || currentFilters.priceMin || currentFilters.priceMax || currentFilters.beds || currentFilters.baths || currentFilters.areaMin || currentFilters.areaMax || (currentFilters.amenities && currentFilters.amenities.length);
    const isFilterEmpty = hasFilters && allProperties.length > 0;
    listEl.innerHTML = `<div class="prop-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.12)" style="margin-bottom:16px;"><path d="${isFilterEmpty ? 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' : 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'}"/></svg>
      <p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:500;">${isFilterEmpty ? 'No properties match your filters' : 'Portfolio coming soon'}</p>
      <p style="color:rgba(255,255,255,0.35);font-size:13px;margin-top:8px;">${isFilterEmpty ? 'Try adjusting your search or clearing filters' : 'New listings are being added — check back shortly'}</p>
      ${isFilterEmpty ? '<button onclick="resetFilters()" style="margin-top:16px;padding:10px 24px;border-radius:100px;background:rgba(77,101,255,0.15);border:1px solid rgba(77,101,255,0.3);color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Clear All Filters</button>' : ''}
    </div>`;
    countEl.textContent = '';
    return;
  }

  // Split: off-plan/new-launch go into carousel, standard go into vertical list
  const offPlanProps = props.filter(p => p.listing_type === 'off_plan' || p.listing_type === 'new_launch');
  const standardProps = props.filter(p => !p.listing_type || p.listing_type === 'standard');

  let html = '';

  // Off-plan carousel (if any)
  if (offPlanProps.length > 0) {
    const carouselCards = offPlanProps.map(p => renderOffPlanCard(p)).join('');
    html += `<div class="offplan-section">
      <div class="offplan-section-header">
        <div class="offplan-section-title">Off Plan & New Launches</div>
        <div class="offplan-section-count">${offPlanProps.length}</div>
      </div>
      <div class="offplan-carousel" id="offplan-carousel">
        <div class="offplan-track">${carouselCards}</div>
      </div>
      <div class="offplan-dots" id="offplan-dots"></div>
    </div>`;
  }

  // Standard property list
  html += standardProps.map((p, i) => renderPropertyCard(p, i)).join('');

  const totalCount = props.length;
  countEl.textContent = `${totalCount} ${totalCount === 1 ? 'property' : 'properties'}`;
  listEl.innerHTML = html;

  // Init carousel swipe if off-plan cards exist
  if (offPlanProps.length > 1) {
    initOffPlanCarousel();
  }
}

// ==========================================
// OFF-PLAN CAROUSEL SWIPE HANDLING
// ==========================================
export function initOffPlanCarousel(carouselId = 'offplan-carousel', dotsId = 'offplan-dots') {
  const carousel = document.getElementById(carouselId);
  const track = carousel?.querySelector('.offplan-track');
  const dotsContainer = document.getElementById(dotsId);
  if (!carousel || !track) return;
  // Prevent duplicate listeners on re-renders
  if (carousel._carouselInit) return;
  carousel._carouselInit = true;

  const cards = track.querySelectorAll('.offplan-card');
  const total = cards.length;
  if (total <= 1) return;

  let currentIdx = 0;
  let startX = 0;
  let startScrollLeft = 0;
  let isDragging = false;

  // Build dots
  if (dotsContainer) {
    dotsContainer.innerHTML = Array.from({ length: total }, (_, i) =>
      `<div class="offplan-dot${i === 0 ? ' active' : ''}"></div>`
    ).join('');
  }

  function updateDots(idx) {
    if (!dotsContainer) return;
    dotsContainer.querySelectorAll('.offplan-dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  }

  function snapToCard(idx) {
    if (idx < 0) idx = 0;
    if (idx >= total) idx = total - 1;
    currentIdx = idx;
    const card = cards[idx];
    const offset = card.offsetLeft - 20; // match carousel padding
    carousel.scrollTo({ left: offset, behavior: 'smooth' });
    updateDots(idx);
  }

  // Touch events
  carousel.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startScrollLeft = carousel.scrollLeft;
    isDragging = true;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) {
      snapToCard(dx < 0 ? currentIdx + 1 : currentIdx - 1);
    } else {
      snapToCard(currentIdx);
    }
  }, { passive: true });

  // Scroll-based dot tracking
  let scrollTimer;
  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const scrollLeft = carousel.scrollLeft;
      let closest = 0;
      let minDist = Infinity;
      cards.forEach((card, i) => {
        const dist = Math.abs(card.offsetLeft - 20 - scrollLeft);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      currentIdx = closest;
      updateDots(closest);
    }, 80);
  }, { passive: true });
}

// ==========================================
// REM OFF-PLAN PROJECT CARD
// ==========================================
function renderRemProjectCard(p, devName) {
  const safeSlug = escAttr(p.slug);
  const safeName = escHtml(p.name);

  const statusBadge = p.status === 'under_construction' ? 'UNDER CONSTRUCTION' : 'OFF PLAN';
  const badgeClass = p.status === 'under_construction' ? 'offplan-badge-launch' : 'offplan-badge-offplan';

  const imgSrc = p.cover_image_url
    ? `<img class="offplan-img" src="${escAttr(optimizeImg(p.cover_image_url))}" alt="${safeName}" width="800" height="500" loading="lazy" onerror="handleImgError(this)">`
    : `<div class="offplan-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`;

  let priceHtml = '';
  if (p.min_price && p.min_price > 0) {
    const formatted = 'AED ' + Number(p.min_price).toLocaleString('en-AE', { maximumFractionDigits: 0 });
    priceHtml = `<div class="offplan-price"><span class="offplan-price-label">Starting from</span><span class="offplan-price-value">${formatted}</span></div>`;
  } else {
    priceHtml = `<div class="offplan-price"><span class="offplan-price-value">Price on Request</span></div>`;
  }

  const location = escHtml((p.district_name || p.area || p.location || '').split(',')[0]);

  let handover = '';
  if (p.completion_date) {
    const d = new Date(p.completion_date);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    handover = `Q${q} ${d.getFullYear()}`;
  }

  let metaHtml = '';
  if (handover) {
    metaHtml = `<div class="offplan-meta"><span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>${handover}</span></div>`;
  }

  return `<div class="offplan-card" onclick="openProjectDetail('${safeSlug}')">
    <div class="offplan-img-wrap">
      ${imgSrc}
      <span class="offplan-badge ${badgeClass}">${statusBadge}</span>
    </div>
    <div class="offplan-body">
      ${devName ? `<div class="offplan-developer">${escHtml(devName)}</div>` : ''}
      <div class="offplan-title">${safeName}</div>
      ${location ? `<div class="offplan-location"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${location}</div>` : ''}
      ${priceHtml}
      ${metaHtml}
    </div>
  </div>`;
}

// ==========================================
// LOAD REM OFF-PLAN PROJECTS (profile page)
// ==========================================
export async function loadRemProjects(agentSlug, agentId) {
  try {
    let projects = [];

    if (agentSlug === 'boban-pepic') {
      // Showcase: show latest 30 projects from global catalog
      const { data } = await supabase
        .from('projects')
        .select('id, slug, name, cover_image_url, min_price, completion_date, status, district_name, area, location, developers!projects_developer_id_fkey(name)')
        .not('status', 'in', '("completed","sold_out")')
        .order('synced_at', { ascending: false })
        .limit(30);
      projects = data || [];
    } else {
      // Approved only — via junction table
      const { data } = await supabase
        .from('agent_projects')
        .select('projects(id, slug, name, cover_image_url, min_price, completion_date, status, district_name, area, location, developers!projects_developer_id_fkey(name))')
        .eq('agent_id', agentId)
        .eq('status', 'approved')
        .limit(12);
      projects = (data || []).map(row => row.projects).filter(Boolean);
    }

    if (!projects.length) return;

    const cards = projects.map(p => {
      const devName = p.developers?.name || '';
      return renderRemProjectCard(p, devName);
    }).join('');

    const section = document.getElementById('rem-projects');
    if (!section) return;

    section.innerHTML = `
      <div class="rem-projects-section">
        <div class="rem-section-heading">Off-Plan Projects</div>
        <div class="offplan-wrap">
          <div class="offplan-carousel" id="rem-carousel">
            <div class="offplan-track">${cards}</div>
          </div>
          <div class="offplan-dots" id="rem-dots"></div>
        </div>
      </div>`;

    if (projects.length > 1) {
      initOffPlanCarousel('rem-carousel', 'rem-dots');
    }
  } catch (e) {
    // Non-critical — section stays hidden on error
    console.error('[rem-projects]', e);
  }
}

export function renderSkeletonCards(count) {
  return Array.from({ length: count }, () =>
    `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>`
  ).join('');
}
