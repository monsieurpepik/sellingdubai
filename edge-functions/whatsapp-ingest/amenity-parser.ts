/**
 * Amenity extraction logic for WhatsApp caption parser.
 * Extracts common Dubai real estate amenities from freeform text
 * and returns them as a string array for the `features` column.
 *
 * To deploy: merge this into the main whatsapp-ingest edge function's
 * parseCaption() method — add `features: extractAmenities(text)` to the result.
 */

const AMENITY_MAP: Record<string, string> = {
  // Pool variants
  'private pool': 'Private Pool',
  'infinity pool': 'Infinity Pool',
  'pool': 'Pool',
  'swimming pool': 'Pool',
  // View variants
  'sea view': 'Sea View',
  'ocean view': 'Sea View',
  'marina view': 'Marina View',
  'landmark view': 'Landmark View',
  'burj khalifa view': 'Burj Khalifa View',
  'burj view': 'Burj Khalifa View',
  'palm view': 'Palm View',
  'golf view': 'Golf View',
  'garden view': 'Garden View',
  'city view': 'City View',
  'canal view': 'Canal View',
  'lake view': 'Lake View',
  'creek view': 'Creek View',
  'full sea view': 'Full Sea View',
  'panoramic view': 'Panoramic View',
  'skyline view': 'Skyline View',
  // Facilities
  'gym': 'In-House Gym',
  'gymnasium': 'In-House Gym',
  'fitness': 'Fitness Center',
  'sauna': 'Sauna',
  'spa': 'Spa',
  'jacuzzi': 'Jacuzzi',
  'concierge': 'Concierge',
  // Outdoor
  'garden': 'Private Garden',
  'terrace': 'Terrace',
  'rooftop': 'Rooftop Terrace',
  'balcony': 'Balcony',
  'bbq': 'BBQ Area',
  'playground': 'Kids Playground',
  // Parking
  'parking': 'Parking',
  'garage': 'Private Garage',
  'valet': 'Valet Parking',
  // Premium
  'maid room': "Maid's Room",
  'maids room': "Maid's Room",
  "maid's room": "Maid's Room",
  'study': 'Study Room',
  'storage': 'Storage Room',
  'smart home': 'Smart Home',
  'furnished': 'Furnished',
  'fully furnished': 'Fully Furnished',
  'unfurnished': 'Unfurnished',
  'semi furnished': 'Semi-Furnished',
  'upgraded': 'Upgraded',
  'brand new': 'Brand New',
  'vacant': 'Vacant',
  'high floor': 'High Floor',
  'low floor': 'Low Floor',
  'mid floor': 'Mid Floor',
  'corner unit': 'Corner Unit',
  'duplex': 'Duplex',
  'penthouse': 'Penthouse',
  'beach access': 'Beach Access',
  'private beach': 'Private Beach',
  'waterfront': 'Waterfront',
  'pet friendly': 'Pet Friendly',
};

// Order matters: check longer phrases first to avoid partial matches
const SORTED_KEYS = Object.keys(AMENITY_MAP).sort((a, b) => b.length - a.length);

export function extractAmenities(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();

  for (const key of SORTED_KEYS) {
    if (lower.includes(key)) {
      const label = AMENITY_MAP[key];
      if (!seen.has(label)) {
        seen.add(label);
        found.push(label);
      }
    }
  }

  return found.slice(0, 8); // Cap at 8 amenities
}
