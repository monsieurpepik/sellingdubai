// ==========================================
// SHARED MUTABLE STATE
// ==========================================
export let currentAgent = null;
export let allProperties = [];
export let currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };

export function setCurrentAgent(agent) {
  currentAgent = agent;
}

export function setAllProperties(props) {
  allProperties = props;
}

export function setCurrentFilters(filters) {
  currentFilters = filters;
}

export function resetCurrentFilters() {
  currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };
}
