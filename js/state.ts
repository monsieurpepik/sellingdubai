// ==========================================
// SHARED MUTABLE STATE
// ==========================================
import type { Database } from '../types/supabase';

export type Agent = Database['public']['Tables']['agents']['Row'];
export type Property = Database['public']['Tables']['properties']['Row'];

export interface Filters {
  search: string;
  priceMin: number;
  priceMax: number;
  beds: number;
  baths: number;
  furnishing: string;
  areaMin: number;
  areaMax: number;
  amenities: string[];
}

export let currentAgent: Agent | null = null;
export let allProperties: Property[] = [];
export let currentFilters: Filters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };

export function setCurrentAgent(agent: Agent | null): void {
  currentAgent = agent;
}

export function setAllProperties(props: Property[]): void {
  allProperties = props;
}

export function setCurrentFilters(filters: Filters): void {
  currentFilters = filters;
}

export function resetCurrentFilters(): void {
  currentFilters = { search: '', priceMin: 0, priceMax: 0, beds: 0, baths: 0, furnishing: 'all', areaMin: 0, areaMax: 0, amenities: [] };
}
