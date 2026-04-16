// ==========================================
// RENDER PROPERTY LIST (lazy chunk only)
// Kept separate from properties.js so that components.ts (renderPropertyCard /
// renderOffPlanCard) is NOT pulled into init.bundle.js.  This file is only
// ever imported by filters.ts (a dynamic chunk), so esbuild places it — and
// its components.ts dependency — in the async chunk rather than init.bundle.js.
// ==========================================

import { renderOffPlanCard, renderPropertyCard } from './components';
import { initOffPlanCarousel, propertiesError, propertiesTotalCount } from './properties';
import { allProperties, currentFilters } from './state';

export function renderPropertyList(props: { listing_type?: string; [key: string]: unknown }[]) {
  const listEl = document.getElementById('prop-list');
  const countEl = document.getElementById('prop-count');
  if (props.length === 0) {
    // Error state — distinct from empty portfolio and empty filter results
    if (propertiesError) {
      listEl!.innerHTML = `<div class="prop-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.12)" style="margin-bottom:16px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:500;">Couldn't load listings</p>
        <p style="color:rgba(255,255,255,0.35);font-size:13px;margin-top:8px;">Check your connection and try again</p>
        <button data-action="retryProperties" style="margin-top:16px;padding:10px 24px;border-radius:100px;background:rgba(77,101,255,0.15);border:1px solid rgba(77,101,255,0.3);color:#fff;font-size:14px;font-weight:500;cursor:pointer;min-height:44px;">Retry</button>
      </div>`;
      countEl!.textContent = '';
      return;
    }
    const hasFilters = currentFilters.search || currentFilters.priceMin || currentFilters.priceMax || currentFilters.beds || currentFilters.baths || currentFilters.areaMin || currentFilters.areaMax || (currentFilters.amenities?.length);
    const isFilterEmpty = hasFilters && allProperties.length > 0;
    listEl!.innerHTML = `<div class="prop-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.12)" style="margin-bottom:16px;"><path d="${isFilterEmpty ? 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' : 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'}"/></svg>
      <p style="color:rgba(255,255,255,0.6);font-size:15px;font-weight:500;">${isFilterEmpty ? 'No properties match your filters' : 'Portfolio coming soon'}</p>
      <p style="color:rgba(255,255,255,0.35);font-size:13px;margin-top:8px;">${isFilterEmpty ? 'Try adjusting your search or clearing filters' : 'New listings are being added — check back shortly'}</p>
      ${isFilterEmpty ? '<button data-action="resetFilters" style="margin-top:16px;padding:10px 24px;border-radius:100px;background:rgba(77,101,255,0.15);border:1px solid rgba(77,101,255,0.3);color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Clear All Filters</button>' : ''}
    </div>`;
    countEl!.textContent = '';
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

  const loadedCount = props.length;
  const total = propertiesTotalCount > loadedCount ? propertiesTotalCount : loadedCount;
  countEl!.textContent = loadedCount < total
    ? `Showing ${loadedCount} of ${total} ${total === 1 ? 'property' : 'properties'}`
    : `${total} ${total === 1 ? 'property' : 'properties'}`;
  listEl!.innerHTML = html;

  // Init carousel swipe if off-plan cards exist
  if (offPlanProps.length > 1) {
    initOffPlanCarousel();
  }
}
