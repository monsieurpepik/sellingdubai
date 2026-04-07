// @ts-nocheck
// ===========================================
// WHATSAPP INGEST v2 — Property Upload + Claude AI + Social Templates
// ===========================================
// Agent sends photo + caption via WhatsApp →
//   1. Parse caption (price, beds, type, area)
//   2. Extract amenities
//   3. Claude generates professional description
//   4. Property listed on profile
//   5. Instagram + TikTok captions sent back to agent
// ===========================================

import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

// Resolve the effective tier, honouring the 7-day grace period on past_due.
// If payment failed but we're still within period_end + 7 days, keep paid tier.
function resolveEffectiveTier(agent: { tier?: string; stripe_subscription_status?: string; stripe_current_period_end?: string }): string {
  const tier = agent.tier ?? "free";
  if (tier === "free") return "free";
  if (agent.stripe_subscription_status === "past_due" && agent.stripe_current_period_end) {
    const graceEnd = new Date(agent.stripe_current_period_end);
    graceEnd.setDate(graceEnd.getDate() + 7);
    if (new Date() > graceEnd) return "free";
  }
  if (agent.stripe_subscription_status === "canceled") return "free";
  return tier;
}

// ── Amenity Map ──
const AMENITY_MAP: Record<string, string> = {
  'private pool': 'Private Pool', 'infinity pool': 'Infinity Pool', 'pool': 'Pool', 'swimming pool': 'Pool',
  'sea view': 'Sea View', 'ocean view': 'Sea View', 'marina view': 'Marina View', 'landmark view': 'Landmark View',
  'burj khalifa view': 'Burj Khalifa View', 'burj view': 'Burj Khalifa View', 'palm view': 'Palm View',
  'golf view': 'Golf View', 'garden view': 'Garden View', 'city view': 'City View', 'canal view': 'Canal View',
  'lake view': 'Lake View', 'creek view': 'Creek View', 'full sea view': 'Full Sea View',
  'panoramic view': 'Panoramic View', 'skyline view': 'Skyline View',
  'gym': 'In-House Gym', 'gymnasium': 'In-House Gym', 'fitness': 'Fitness Center',
  'sauna': 'Sauna', 'spa': 'Spa', 'jacuzzi': 'Jacuzzi', 'concierge': 'Concierge',
  'garden': 'Private Garden', 'terrace': 'Terrace', 'rooftop': 'Rooftop Terrace',
  'balcony': 'Balcony', 'bbq': 'BBQ Area', 'playground': 'Kids Playground',
  'parking': 'Parking', 'garage': 'Private Garage', 'valet': 'Valet Parking',
  'maid room': "Maid's Room", 'maids room': "Maid's Room", "maid's room": "Maid's Room",
  'study': 'Study Room', 'storage': 'Storage Room', 'smart home': 'Smart Home',
  'furnished': 'Furnished', 'fully furnished': 'Fully Furnished', 'unfurnished': 'Unfurnished',
  'semi furnished': 'Semi-Furnished', 'upgraded': 'Upgraded', 'brand new': 'Brand New',
  'vacant': 'Vacant', 'high floor': 'High Floor', 'low floor': 'Low Floor', 'mid floor': 'Mid Floor',
  'corner unit': 'Corner Unit', 'duplex': 'Duplex', 'penthouse': 'Penthouse',
  'beach access': 'Beach Access', 'private beach': 'Private Beach', 'waterfront': 'Waterfront',
  'pet friendly': 'Pet Friendly',
};
const SORTED_AMENITY_KEYS = Object.keys(AMENITY_MAP).sort((a, b) => b.length - a.length);

function extractAmenities(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const key of SORTED_AMENITY_KEYS) {
    if (lower.includes(key)) {
      const label = AMENITY_MAP[key];
      if (!seen.has(label)) { seen.add(label); found.push(label); }
    }
  }
  return found.slice(0, 8);
}

// ── Property Caption Parser ──
function parsePropertyCaption(caption: string): {
  title: string; price: string | null; type: string | null;
  bedrooms: number | null; bathrooms: number | null;
  area: string | null; sqft: number | null; features: string[];
} {
  const text = caption.trim();
  if (!text) return { title: '', price: null, type: null, bedrooms: null, bathrooms: null, area: null, sqft: null, features: [] };

  // Price
  let price: string | null = null;
  const priceMatch = text.match(/(?:AED\s*)?(\d[\d,.]*)\s*(?:M(?:illion)?|K)?\s*(?:AED)?/i);
  if (priceMatch) {
    const raw = priceMatch[0].trim();
    if (/AED|M(?:illion)?|K/i.test(raw)) price = raw;
  }

  // Bedrooms & Bathrooms
  let bedrooms: number | null = null;
  const brMatch = text.match(/(\d+)\s*(?:BR|BHK|bed(?:room)?s?)/i);
  if (brMatch) bedrooms = parseInt(brMatch[1]);

  let bathrooms: number | null = null;
  const bathMatch = text.match(/(\d+)\s*(?:bath(?:room)?s?|BA)/i);
  if (bathMatch) bathrooms = parseInt(bathMatch[1]);

  // Sqft
  let sqft: number | null = null;
  const sqftMatch = text.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
  if (sqftMatch) sqft = parseInt(sqftMatch[1].replace(/,/g, ''));

  // Property type
  let type: string | null = null;
  const typePatterns: Record<string, RegExp> = {
    'Apartment': /apartment|apt|flat/i, 'Villa': /villa/i, 'Townhouse': /townhouse|town\s*house/i,
    'Penthouse': /penthouse/i, 'Studio': /studio/i, 'Duplex': /duplex/i,
    'Land': /plot|land/i, 'Office': /office/i, 'Retail': /retail|shop/i,
  };
  for (const [t, re] of Object.entries(typePatterns)) {
    if (re.test(text)) { type = t; break; }
  }

  // Area
  let area: string | null = null;
  const areaPatterns = ['Downtown', 'Marina', 'JBR', 'Palm Jumeirah', 'Palm', 'Business Bay', 'Creek Harbour',
    'JVC', 'JLT', 'DIFC', 'City Walk', 'MBR City', 'Dubai Hills', 'Emirates Hills', 'Arabian Ranches',
    'Damac Hills', 'Sports City', 'Motor City', 'Al Barsha', 'Jumeirah', 'Silicon Oasis',
    'International City', 'Discovery Gardens', 'Mirdif', 'Rashid Yachts', 'Emaar Beachfront',
    'Bluewaters', 'Dubai South', 'Town Square', 'Al Furjan', 'Sobha Hartland', 'Mohammed Bin Rashid City',
    'Dubai Creek', 'Tilal Al Ghaf', 'The Valley', 'Dubai Islands', 'Yas Island', 'Saadiyat'];
  for (const a of areaPatterns) {
    if (text.toLowerCase().includes(a.toLowerCase())) { area = a; break; }
  }

  // Amenities
  const features = extractAmenities(text);

  // Title (cleaned)
  let title = text;
  if (price) title = title.replace(price, '').trim();
  title = title.replace(/^[,\-–—·|/]+|[,\-–—·|/]+$/g, '').trim();
  if (!title) title = [type, bedrooms ? `${bedrooms}BR` : '', area].filter(Boolean).join(' ') || 'New Property';

  return { title, price, type, bedrooms, bathrooms, area, sqft, features };
}

// ── Claude AI Description Generator ──
async function generateListingWithClaude(parsed: ReturnType<typeof parsePropertyCaption>, agentName: string): Promise<{
  title: string; description: string; igCaption: string; tiktokCaption: string;
} | null> {
  const CLAUDE_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!CLAUDE_KEY) return null;

  const propertyInfo = [
    parsed.title,
    parsed.type ? `Type: ${parsed.type}` : '',
    parsed.bedrooms ? `${parsed.bedrooms} bedrooms` : '',
    parsed.bathrooms ? `${parsed.bathrooms} bathrooms` : '',
    parsed.sqft ? `${parsed.sqft} sqft` : '',
    parsed.area ? `Location: ${parsed.area}` : '',
    parsed.price ? `Price: ${parsed.price}` : '',
    parsed.features.length ? `Features: ${parsed.features.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are a Dubai luxury real estate copywriter. Given this property info from an agent's WhatsApp message, generate EXACTLY this JSON (no markdown, no code blocks, just raw JSON):

{"title":"<catchy 5-8 word listing title>","description":"<2-3 sentence luxury property description, emphasize lifestyle and location, mention specific features>","igCaption":"<Instagram caption: hook line + 2 sentences + 5 relevant hashtags like #DubaiRealEstate #LuxuryLiving etc + CTA 'Link in bio for details'>","tiktokCaption":"<TikTok caption: punchy hook + 1 sentence + 3 hashtags + CTA>"}

Property info:
${propertyInfo}
Agent: ${agentName}

Rules:
- Title must be compelling, not generic
- Description should sell the lifestyle, not just list specs
- Instagram caption should be scroll-stopping, use 1-2 relevant emojis
- TikTok caption should be punchy and short
- All in English
- Return ONLY valid JSON, nothing else`
        }]
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const result = JSON.parse(jsonStr);

    return {
      title: result.title || parsed.title,
      description: result.description || "",
      igCaption: result.igCaption || "",
      tiktokCaption: result.tiktokCaption || "",
    };
  } catch (_e) {
    return null;
  }
}

// ── PDF Brochure Helpers ──

function formatPriceForPDF(price: number): string {
  const p = Number(price);
  if (isNaN(p)) return "AED —";
  if (p >= 1_000_000) {
    const m = p / 1_000_000;
    return `AED ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2)}M`;
  }
  if (p >= 1_000) {
    return `AED ${Math.round(p / 1_000)}K`;
  }
  return `AED ${Math.round(p).toLocaleString()}`;
}

// Strip characters outside Latin-1 (Helvetica only supports Latin-1)
function sanitizeForPDF(text: string): string {
  return text.replace(/[^\x00-\xFF]/g, '').replace(/\s+/g, ' ').trim();
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      if (lines.length >= maxLines) break;
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length >= maxLines) break;
  }
  return lines;
}

async function generatePropertyPDF(
  agent: {
    name: string;
    photo_url: string | null;
    broker_number: string | null;
    dld_broker_number: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    agency_name: string | null;
    slug: string;
  },
  property: {
    title: string;
    price: number | null;
    location: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    area_sqft: number | null;
    type: string | null;
    property_type: string | null;
    status: string | null;
    image_url: string | null;
    trakheesi_permit: string | null;
    description: string | null;
    features: string[] | null;
  },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 595;
  const pad = 24;

  // Selling Dubai brand palette
  const black     = rgb(0, 0, 0);                   // #000000 background
  const white     = rgb(1, 1, 1);                   // #ffffff primary text
  const blue      = rgb(0.067, 0.153, 0.824);       // #1127d2 accent / highlight
  const muted     = rgb(0.6, 0.6, 0.6);             // #999999 secondary text
  const darkPanel = rgb(0.08, 0.08, 0.08);          // slightly off-black for panel fills
  const divider   = rgb(0.14, 0.14, 0.14);          // subtle separator line

  // ── Full-page black background ──
  page.drawRectangle({ x: 0, y: 0, width: W, height: 842, color: black });

  // ── Header band (y=797–842, 45pt) ──
  page.drawRectangle({ x: 0, y: 797, width: W, height: 45, color: darkPanel });
  page.drawText("PROPERTY BROCHURE", { x: pad, y: 813, size: 13, font: fontBold, color: white });
  const domainLabel = "SELLINGDUBAI.AE";
  const domainW = fontRegular.widthOfTextAtSize(domainLabel, 9);
  page.drawText(domainLabel, { x: W - pad - domainW, y: 816, size: 9, font: fontRegular, color: blue });

  // ── Property hero image (y=550–795, 245pt) ──
  const imgY = 550;
  const imgH = 245;

  let propertyImage = null;
  if (property.image_url) {
    try {
      const imgRes = await fetch(property.image_url);
      if (imgRes.ok) {
        const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") || "";
        try {
          propertyImage = ct.includes("png") || property.image_url.toLowerCase().endsWith(".png")
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);
        } catch (_e) { /* embed failed — skip image */ }
      }
    } catch (_e) { /* fetch failed — skip image */ }
  }

  if (propertyImage) {
    page.drawImage(propertyImage, { x: 0, y: imgY, width: W, height: imgH });
    // Dark gradient overlay at bottom of image so title reads cleanly
    page.drawRectangle({ x: 0, y: imgY, width: W, height: 40, color: black, opacity: 0.5 });
  } else {
    page.drawRectangle({ x: 0, y: imgY, width: W, height: imgH, color: darkPanel });
    const placeholder = "PROPERTY IMAGE";
    const phW = fontRegular.widthOfTextAtSize(placeholder, 12);
    page.drawText(placeholder, { x: W / 2 - phW / 2, y: imgY + imgH / 2 - 6, size: 12, font: fontRegular, color: muted });
  }

  // Status badge (top-left of image)
  const statusColors: Record<string, ReturnType<typeof rgb>> = {
    just_listed: rgb(0.067, 0.153, 0.824), // brand blue
    available:   rgb(0.13, 0.55, 0.27),
    under_offer: rgb(0.30, 0.20, 0.65),    // violet — no warm/gold tones
    sold:        rgb(0.65, 0.10, 0.10),
    rented:      rgb(0.40, 0.15, 0.60),
  };
  const statusLabels: Record<string, string> = {
    just_listed: "JUST LISTED",
    available:   "AVAILABLE",
    under_offer: "UNDER OFFER",
    sold:        "SOLD",
    rented:      "RENTED",
  };
  const status = property.status || "available";
  const statusColor = statusColors[status] ?? statusColors.available;
  const statusLabel = statusLabels[status] ?? status.toUpperCase().replace(/_/g, " ");
  const badgeTextW = fontBold.widthOfTextAtSize(statusLabel, 9);
  const badgeW = badgeTextW + 16;
  page.drawRectangle({ x: pad, y: imgY + imgH - 32, width: badgeW, height: 22, color: statusColor });
  page.drawText(statusLabel, { x: pad + 8, y: imgY + imgH - 24, size: 9, font: fontBold, color: white });

  // ── Content area ──
  let curY = 536;

  // Title (wrap up to 2 lines)
  const titleLines = wrapText(sanitizeForPDF(property.title), fontBold, 16, W - pad * 2, 2);
  for (const line of titleLines) {
    page.drawText(line, { x: pad, y: curY, size: 16, font: fontBold, color: white });
    curY -= 22;
  }
  curY -= 4;

  // Price
  if (property.price) {
    const priceStr = formatPriceForPDF(property.price);
    page.drawText(priceStr, { x: pad, y: curY, size: 14, font: fontBold, color: blue });
    curY -= 24;
  }

  // Specs bar
  const propType = property.type || property.property_type || "";
  const specs: string[] = [];
  if (property.bedrooms != null) specs.push(`${property.bedrooms} Bed`);
  if (property.bathrooms != null) specs.push(`${property.bathrooms} Bath`);
  if (propType) specs.push(propType);
  if (property.area_sqft) specs.push(`${property.area_sqft.toLocaleString()} sqft`);
  if (property.location) specs.push(sanitizeForPDF(property.location));

  if (specs.length > 0) {
    page.drawRectangle({ x: 0, y: curY - 8, width: W, height: 26, color: darkPanel });
    page.drawText(specs.join("   ·   "), { x: pad, y: curY + 2, size: 10, font: fontRegular, color: muted });
    curY -= 36;
  }

  // Divider
  page.drawLine({ start: { x: pad, y: curY }, end: { x: W - pad, y: curY }, thickness: 0.5, color: divider });
  curY -= 16;

  // Description
  if (property.description && curY > 200) {
    page.drawText("ABOUT THIS PROPERTY", { x: pad, y: curY, size: 8, font: fontBold, color: blue });
    curY -= 14;
    const descLines = wrapText(sanitizeForPDF(property.description), fontRegular, 10, W - pad * 2, 5);
    for (const line of descLines) {
      if (curY < 175) break;
      page.drawText(line, { x: pad, y: curY, size: 10, font: fontRegular, color: white });
      curY -= 14;
    }
    curY -= 8;
  }

  // Features / amenities
  if (property.features && property.features.length > 0 && curY > 210) {
    page.drawText("KEY FEATURES", { x: pad, y: curY, size: 8, font: fontBold, color: blue });
    curY -= 14;
    const features = property.features.slice(0, 9);
    const colWidth = (W - pad * 2) / 3;
    const maxRows = Math.ceil(features.length / 3);
    for (let i = 0; i < features.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const fx = pad + col * colWidth;
      const fy = curY - row * 17;
      if (fy < 175) break;
      page.drawRectangle({ x: fx, y: fy + 1, width: 7, height: 7, color: blue });
      page.drawText(sanitizeForPDF(features[i]), { x: fx + 11, y: fy, size: 9, font: fontRegular, color: white });
    }
    curY -= maxRows * 17 + 8;
  }

  // DLD / Trakheesi permit + QR
  if (property.trakheesi_permit && curY > 195) {
    page.drawLine({ start: { x: pad, y: curY }, end: { x: W - pad, y: curY }, thickness: 0.5, color: divider });
    curY -= 14;
    page.drawText("RERA / DLD PERMIT NO.", { x: pad, y: curY, size: 8, font: fontBold, color: blue });
    curY -= 14;
    page.drawText(sanitizeForPDF(property.trakheesi_permit), { x: pad, y: curY, size: 11, font: fontBold, color: white });

    // QR code
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&format=png&bgcolor=000000&color=ffffff&data=${encodeURIComponent(property.trakheesi_permit)}`;
      const qrRes = await fetch(qrUrl);
      if (qrRes.ok) {
        const qrBytes = new Uint8Array(await qrRes.arrayBuffer());
        const qrImage = await pdfDoc.embedPng(qrBytes);
        page.drawImage(qrImage, { x: W - pad - 72, y: curY - 56, width: 72, height: 72 });
      }
    } catch (_e) { /* QR code failed — skip */ }
  }

  // ── Footer band (y=0–152) ──
  page.drawRectangle({ x: 0, y: 0, width: W, height: 152, color: darkPanel });
  page.drawRectangle({ x: 0, y: 150, width: W, height: 2, color: blue });

  // Agent photo
  const photoSize = 64;
  const photoX = pad;
  const photoY = 44;

  let agentPhotoImage = null;
  if (agent.photo_url) {
    try {
      const photoRes = await fetch(agent.photo_url);
      if (photoRes.ok) {
        const photoBytes = new Uint8Array(await photoRes.arrayBuffer());
        const ct = photoRes.headers.get("content-type") || "";
        try {
          agentPhotoImage = ct.includes("png") || agent.photo_url.toLowerCase().endsWith(".png")
            ? await pdfDoc.embedPng(photoBytes)
            : await pdfDoc.embedJpg(photoBytes);
        } catch (_e) { /* embed failed — skip photo */ }
      }
    } catch (_e) { /* fetch failed — skip photo */ }
  }

  if (agentPhotoImage) {
    page.drawImage(agentPhotoImage, { x: photoX, y: photoY, width: photoSize, height: photoSize });
  } else {
    page.drawRectangle({ x: photoX, y: photoY, width: photoSize, height: photoSize, color: divider });
  }

  // Agent info (left column)
  const infoX = photoX + photoSize + 16;
  let infoY = 100;
  page.drawText(sanitizeForPDF(agent.name), { x: infoX, y: infoY, size: 13, font: fontBold, color: white });
  infoY -= 17;

  const reraNum = agent.broker_number || agent.dld_broker_number;
  if (reraNum) {
    page.drawText(`RERA: ${sanitizeForPDF(reraNum)}`, { x: infoX, y: infoY, size: 9, font: fontRegular, color: blue });
    infoY -= 13;
  }
  if (agent.agency_name) {
    page.drawText(sanitizeForPDF(agent.agency_name), { x: infoX, y: infoY, size: 9, font: fontRegular, color: muted });
  }

  // Contact info (right column)
  const contactX = Math.round(W / 2) + 16;
  let contactY = 100;
  const contactPhone = agent.whatsapp || agent.phone;
  if (contactPhone) {
    page.drawText(sanitizeForPDF(contactPhone), { x: contactX, y: contactY, size: 9, font: fontRegular, color: muted });
    contactY -= 13;
  }
  if (agent.email) {
    page.drawText(sanitizeForPDF(agent.email), { x: contactX, y: contactY, size: 9, font: fontRegular, color: muted });
    contactY -= 13;
  }
  page.drawText(`sellingdubai.ae/a/${agent.slug}`, { x: contactX, y: contactY, size: 9, font: fontRegular, color: blue });

  return pdfDoc.save();
}

async function uploadPDFToWhatsApp(pdfBytes: Uint8Array, filename: string): Promise<string | null> {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!WA_TOKEN || !WA_PHONE_ID) return null;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), filename);

  const res = await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
    body: form,
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.id ?? null;
}

async function sendWhatsAppDocument(to: string, mediaId: string, filename: string, caption: string) {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!WA_TOKEN || !WA_PHONE_ID) return;

  try {
    await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { id: mediaId, filename, caption },
      }),
    });
  } catch (_e) { /* send failed silently */ }
}

async function handleShareCommand(
  senderPhone: string,
  agentId: string,
  agentSlug: string,
  query: string,
  supabase: ReturnType<typeof createClient>,
) {
  // Fetch agent profile and active properties in parallel
  const [agentResult, propertiesResult] = await Promise.all([
    supabase
      .from("agents")
      .select("name, slug, photo_url, broker_number, dld_broker_number, email, phone, whatsapp, agency_name")
      .eq("id", agentId)
      .single(),
    supabase
      .from("properties")
      .select("id, title, price, location, bedrooms, bathrooms, area_sqft, type, property_type, status, image_url, trakheesi_permit, description, features")
      .eq("agent_id", agentId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const agentFull = agentResult.data;
  const properties = propertiesResult.data;

  if (!agentFull) {
    await sendWhatsAppReply(senderPhone, "Could not fetch your profile. Please try again.");
    return;
  }

  if (!properties || properties.length === 0) {
    await sendWhatsAppReply(senderPhone, "No active listings found. Add a property first.");
    return;
  }

  // Fuzzy-match property title; default to most recent if no query
  let matchedProp = properties[0];
  if (query.trim()) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
    let bestScore = -1;
    for (const prop of properties) {
      const propWords = (prop.title || "").toLowerCase().split(/\s+/);
      let score = 0;
      for (const qw of queryWords) {
        if (propWords.some((pw: string) => pw.includes(qw) || qw.includes(pw))) score++;
      }
      if (score > bestScore) { bestScore = score; matchedProp = prop; }
    }
  }

  await sendWhatsAppReply(senderPhone, `Generating brochure for *${matchedProp.title}*...`);

  try {
    const pdfBytes = await generatePropertyPDF(agentFull, matchedProp);
    const safeTitle = (matchedProp.title || "property").replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
    const filename = `${safeTitle}-brochure.pdf`;

    const mediaId = await uploadPDFToWhatsApp(pdfBytes, filename);
    if (!mediaId) {
      await sendWhatsAppReply(senderPhone, "Failed to upload brochure. Please try again.");
      return;
    }

    const priceStr = matchedProp.price ? ` | ${formatPriceForPDF(matchedProp.price)}` : "";
    const caption = `${matchedProp.title}${priceStr} | sellingdubai.ae/a/${agentSlug}`;
    await sendWhatsAppDocument(senderPhone, mediaId, filename, caption);
  } catch (_e) {
    await sendWhatsAppReply(senderPhone, "Failed to generate brochure. Please try again.");
  }
}

// ── WhatsApp Helpers ──
async function sendWhatsAppReply(to: string, text: string) {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log("WhatsApp reply (not sent, no creds):", to, text);
    return;
  }
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
  } catch (_e) { /* reply failed silently */ }
}

async function downloadAndUploadImage(supabase: ReturnType<typeof createClient>, mediaId: string, agentSlug: string): Promise<string | null> {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!WA_TOKEN) return null;

  const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` }
  });
  if (!mediaRes.ok) { return null; }
  const mediaData = await mediaRes.json();
  if (!mediaData.url) return null;

  const imgRes = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  if (!imgRes.ok) { return null; }
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';

  const fileName = `${agentSlug}/property-${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('agent-images')
    .upload(fileName, imgBytes, { contentType, upsert: true });

  if (uploadErr) { return null; }

  const { data: urlData } = supabase.storage.from('agent-images').getPublicUrl(fileName);
  return urlData.publicUrl;
}

// ── Intent Detection ──
type IntentResult =
  | { action: "share_property"; query: string }
  | { action: "update_status"; query: string; status: string }
  | { action: "get_leads" }
  | { action: "get_stats" }
  | { action: "get_help" }
  | { action: "add_property" }
  | { action: "unknown" };

async function detectIntent(rawText: string): Promise<IntentResult> {
  const CLAUDE_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!CLAUDE_KEY) return { action: "unknown" };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        messages: [{
          role: "user",
          content: `Classify this WhatsApp message from a Dubai real estate agent. Return ONLY valid JSON, no markdown, no explanation.

Intents:
- share_property: wants a PDF brochure. Include "query" with property name or "" if unspecified.
- update_status: wants to update a listing status. Include "query" (property name) and "status" (one of: sold|rented|under_offer|available|reserved|just_listed).
- get_leads: wants to see today's leads/enquiries.
- get_stats: wants analytics/stats/views.
- get_help: greeting or asking for help.
- add_property: looks like a property listing (price, bedrooms, location — no photo needed).
- unknown: anything else.

Message: "${rawText.replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 300)}"

Return JSON like: {"action":"get_stats"} or {"action":"share_property","query":"Marina tower"} or {"action":"update_status","query":"JBR villa","status":"sold"}`
        }],
      }),
    });

    if (!res.ok) {
      return { action: "unknown" };
    }

    const data = await res.json();
    const text = (data.content?.[0]?.text || "").trim();
    const parsed = JSON.parse(text);

    if (!parsed?.action) return { action: "unknown" };
    const { action } = parsed;
    if (action === "share_property") return { action, query: parsed.query || "" };
    if (action === "update_status") return { action, query: parsed.query || "", status: parsed.status || "available" };
    if (["get_leads", "get_stats", "get_help", "add_property", "unknown"].includes(action)) return { action } as IntentResult;
    return { action: "unknown" };
  } catch (_e) {
    return { action: "unknown" };
  }
}

// ── Update Property Status ──
async function handleUpdateStatus(
  senderPhone: string,
  agentId: string,
  query: string,
  rawStatus: string,
  supabase: ReturnType<typeof createClient>,
) {
  const STATUS_MAP: Record<string, string> = {
    sold: "sold", rented: "rented", under_offer: "under_offer",
    available: "available", reserved: "reserved", just_listed: "just_listed",
  };
  const status = STATUS_MAP[rawStatus] || "available";

  const { data: properties } = await supabase
    .from("properties")
    .select("id, title")
    .eq("agent_id", agentId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (!properties || properties.length === 0) {
    await sendWhatsAppReply(senderPhone, "No active listings found.");
    return;
  }

  let matchedProp = properties[0];
  if (query.trim()) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
    let bestScore = -1;
    for (const prop of properties) {
      const propWords = (prop.title || "").toLowerCase().split(/\s+/);
      let score = 0;
      for (const qw of queryWords) {
        if (propWords.some((pw: string) => pw.includes(qw) || qw.includes(pw))) score++;
      }
      if (score > bestScore) { bestScore = score; matchedProp = prop; }
    }
  }

  const { error } = await supabase
    .from("properties")
    .update({ status })
    .eq("id", matchedProp.id)
    .eq("agent_id", agentId);

  if (error) {
    await sendWhatsAppReply(senderPhone, "Failed to update status. Please try again.");
    return;
  }

  const STATUS_LABELS: Record<string, string> = {
    sold: "Sold ✅", rented: "Rented ✅", under_offer: "Under Offer 🤝",
    available: "Available 🟢", reserved: "Reserved 🔒", just_listed: "Just Listed ✨",
  };
  await sendWhatsAppReply(senderPhone, `✅ *${matchedProp.title}* updated to *${STATUS_LABELS[status] || status}*`);
}

// ── AGENCY CONTEXT ──
interface AgencyContext {
  agencyName: string;
  agentIds: string[];
  agentNames: Map<string, string>;
}

async function resolveAgencyContext(
  agentId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<AgencyContext | null> {
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("owner_agent_id", agentId)
    .maybeSingle();
  if (!agency) return null;

  const { data: members } = await supabase
    .from("agents")
    .select("id, name")
    .eq("agency_id", agency.id)
    .limit(100);
  if (!members || members.length === 0) return null;

  return {
    agencyName: agency.name,
    agentIds: members.map((m: any) => m.id),
    agentNames: new Map<string, string>(members.map((m: any) => [m.id, m.name])),
  };
}

// ── Get Today's Leads ──
async function handleGetLeads(
  senderPhone: string,
  agentId: string,
  supabase: ReturnType<typeof createClient>,
  agencyCtx?: AgencyContext,
) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let leadsQuery = supabase
    .from("leads")
    .select("agent_id, name, phone, email, message, preferred_area, property_type, created_at")
    .gte("created_at", todayStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  if (agencyCtx) {
    leadsQuery = leadsQuery.in("agent_id", agencyCtx.agentIds);
  } else {
    leadsQuery = leadsQuery.eq("agent_id", agentId);
  }

  const { data: leads } = await leadsQuery;

  if (!leads || leads.length === 0) {
    await sendWhatsAppReply(senderPhone, `No leads yet today${agencyCtx ? " across " + agencyCtx.agencyName : ""}. Keep sharing your link! 🚀`);
    return;
  }

  const header = agencyCtx
    ? `📩 *${agencyCtx.agencyName} — Today's Leads (${leads.length})*`
    : `📩 *Today's Leads (${leads.length})*`;

  const lines = leads.map((lead, i) => {
    const time = new Date(lead.created_at).toLocaleTimeString("en-AE", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
    });
    const contact = lead.phone || lead.email || "—";

    let property = "—";
    if (lead.message) {
      const m = lead.message.match(/interested in:\s*(.+)/i);
      if (m) property = m[1].trim();
      else if (lead.preferred_area) property = lead.preferred_area;
      else if (lead.property_type) property = lead.property_type;
    } else if (lead.preferred_area) {
      property = lead.preferred_area;
    } else if (lead.property_type) {
      property = lead.property_type;
    }

    const agentLabel = agencyCtx
      ? `\n   👤 ${agencyCtx.agentNames.get(lead.agent_id) || "Unknown"}`
      : "";

    return `${i + 1}. *${lead.name}*\n   📞 ${contact}\n   🏠 ${property}\n   🕐 ${time}${agentLabel}`;
  });

  await sendWhatsAppReply(senderPhone, `${header}\n\n${lines.join("\n\n")}`);
}

// ── Main Handler ──
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Content-Type": "application/json",
};

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('whatsapp-ingest', req);
  const _start = Date.now();
  const url = new URL(req.url);

  // === WEBHOOK VERIFICATION (GET) ===
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const VERIFY_TOKEN = Deno.env.get("WH_VERIFY_TOKEN");
    if (!VERIFY_TOKEN) return new Response("Server misconfiguration.", { status: 500 });
    if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("OK", { status: 200 });

  try {
    const rawBody = await req.text();

    // HMAC-SHA256 signature verification (Meta X-Hub-Signature-256)
    const appSecret = Deno.env.get("WH_APP_SECRET");
    if (!appSecret) {
      return new Response("Server misconfiguration.", { status: 500 });
    }
    const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
    const expected = sigHeader.replace(/^sha256=/, "");
    const keyBytes = new TextEncoder().encode(appSecret);
    const msgBytes = new TextEncoder().encode(rawBody);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
    const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (computed.length !== expected.length) {
      return new Response("Forbidden", { status: 403 });
    }
    let hmacDiff = 0;
    for (let i = 0; i < computed.length; i++) {
      hmacDiff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (hmacDiff !== 0) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = JSON.parse(rawBody);
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    const msg = messages[0];
    const senderPhone = msg.from;
    const msgType = msg.type;

    const supabase = _createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find agent by WhatsApp number
    const cleanPhone = senderPhone.replace(/[^0-9]/g, '');
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, slug, whatsapp, tier, stripe_subscription_status, stripe_current_period_end")
      .or(`whatsapp.eq.${cleanPhone},whatsapp.eq.+${cleanPhone},whatsapp.ilike.%${cleanPhone.slice(-9)}`)
      .maybeSingle();

    if (agentErr || !agent) {
      log({ event: 'auth_failed', status: 200 });
      await sendWhatsAppReply(senderPhone, "Hi! Your number isn't registered on SellingDubai yet. Visit sellingdubai.ae/join to create your profile first.");
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // === HANDLE IMAGE MESSAGE ===
    if (msgType === "image") {
      const imageId = msg.image?.id;
      const caption = msg.image?.caption || "";
      const parsed = parsePropertyCaption(caption);

      // Upload image
      let imageUrl: string | null = null;
      if (imageId) {
        try { imageUrl = await downloadAndUploadImage(supabase, imageId, agent.slug); }
        catch (_e) { /* image upload failed — proceed without image */ }
      }

      // Send "processing" message immediately so agent knows we got it
      await sendWhatsAppReply(senderPhone, "📸 Got it! Generating your listing...");

      // Generate AI description + social templates
      const aiResult = await generateListingWithClaude(parsed, agent.name);

      const finalTitle = aiResult?.title || parsed.title || "New Property";
      const finalDescription = aiResult?.description || "";

      // Parse price to number
      let priceNum: number | null = null;
      if (parsed.price) {
        const cleaned = parsed.price.replace(/[^0-9.]/g, '');
        let num = parseFloat(cleaned);
        if (/M(?:illion)?/i.test(parsed.price)) num *= 1000000;
        if (/K/i.test(parsed.price)) num *= 1000;
        if (!isNaN(num) && num > 0) priceNum = num;
      }

      // ─── Listing limit enforcement ────────────────────────────────────────
      const effectiveTier = resolveEffectiveTier(agent);
      const LISTING_LIMITS: Record<string, number> = { free: 3, pro: 20, premium: Infinity };
      const limit = LISTING_LIMITS[effectiveTier] ?? 3;

      if (limit !== Infinity) {
        const { count: activeCount } = await supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id)
          .eq("is_active", true);

        if ((activeCount ?? 0) >= limit) {
          const upgradeMsg = effectiveTier === "free"
            ? `You've reached the ${limit}-listing limit on the Free plan.\n\nUpgrade to Pro (AED 199/mo) for up to 20 listings, or Premium (AED 499/mo) for unlimited.\n\n👉 sellingdubai.ae/pricing`
            : `You've reached the ${limit}-listing limit on the Pro plan.\n\nUpgrade to Premium (AED 499/mo) for unlimited listings.\n\n👉 sellingdubai.ae/pricing`;
          await sendWhatsAppReply(senderPhone, upgradeMsg);
          return new Response(JSON.stringify({ success: true }), { headers: CORS });
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // Create property
      const { data: prop, error: propErr } = await supabase
        .from("properties")
        .insert({
          agent_id: agent.id,
          title: finalTitle,
          description: finalDescription,
          price: priceNum,
          image_url: imageUrl,
          property_type: parsed.type || null,
          bedrooms: parsed.bedrooms || null,
          bathrooms: parsed.bathrooms || null,
          area_sqft: parsed.sqft || null,
          location: parsed.area || null,
          features: parsed.features.length > 0 ? parsed.features : null,
          source: 'whatsapp',
          is_active: true,
          status: 'just_listed',
        })
        .select()
        .single();

      if (propErr) {
        await sendWhatsAppReply(senderPhone, "Sorry, there was an error listing your property. Try again.");
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // Build confirmation + social templates
      const profileUrl = `https://sellingdubai.ae/a/${agent.slug}`;
      let confirmMsg = `✅ *Listed!*\n\n*${finalTitle}*`;
      if (parsed.price) confirmMsg += `\nPrice: ${parsed.price}`;
      if (parsed.area) confirmMsg += `\n📍 ${parsed.area}`;
      if (parsed.features.length) confirmMsg += `\n✨ ${parsed.features.slice(0, 4).join(' · ')}`;
      if (finalDescription) confirmMsg += `\n\n${finalDescription}`;
      confirmMsg += `\n\n🔗 Live on your profile:\n${profileUrl}`;

      await sendWhatsAppReply(senderPhone, confirmMsg);

      // If AI content failed, let the agent know so they can request it later
      if (!aiResult) {
        await sendWhatsAppReply(senderPhone, "⚠️ AI descriptions are temporarily unavailable — your listing was saved with the details you provided. Type *social* anytime to generate Instagram & TikTok captions.");
      }

      // Send Instagram caption
      if (aiResult?.igCaption) {
        await sendWhatsAppReply(senderPhone,
          `📸 *Copy for Instagram:*\n\n${aiResult.igCaption}`
        );
      }

      // Send TikTok caption
      if (aiResult?.tiktokCaption) {
        await sendWhatsAppReply(senderPhone,
          `🎬 *Copy for TikTok:*\n\n${aiResult.tiktokCaption}`
        );
      }

      log({ event: 'success', agent_id: agent.id, status: 200 });
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // === HANDLE TEXT MESSAGE ===
    if (msgType === "text") {
      const rawText = msg.text?.body || "";
      const intent = await detectIntent(rawText);

      const agencyCtx = await resolveAgencyContext(agent.id, supabase);

      switch (intent.action) {
        case "get_help":
          await sendWhatsAppReply(senderPhone,
            `Hey ${agent.name}! 👋\n\nTo add a property:\n\n📸 *Send a photo* with a caption like:\n_Marina View 2BR, AED 2.5M, sea view, furnished_\n\nI'll create a professional listing with AI description + Instagram & TikTok captions ready to post.\n\nCommands:\n• *"my stats"* — profile analytics\n• *"my leads"* — today's enquiries\n• *"my link"* — your profile link\n• *"remove last"* — remove last property\n• *"social"* — get social templates for your latest listing\n• *"share [title]"* — generate a PDF brochure\n• *"mark [title] as sold"* — update listing status`
          );
          break;

        case "get_stats": {
          const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
          const targetIds = agencyCtx ? agencyCtx.agentIds : [agent.id];
          const label = agencyCtx ? agencyCtx.agencyName : "Your Stats";
          const [viewsRes, waTapsRes, leadsRes] = await Promise.allSettled([
            supabase.from("page_events").select("id", { count: "exact", head: true }).in("agent_id", targetIds).eq("event_type", "view").gte("created_at", thisMonthStart),
            supabase.from("page_events").select("id", { count: "exact", head: true }).in("agent_id", targetIds).eq("event_type", "whatsapp_tap").gte("created_at", thisMonthStart),
            supabase.from("page_events").select("id", { count: "exact", head: true }).in("agent_id", targetIds).eq("event_type", "lead_submit").gte("created_at", thisMonthStart),
          ]);
          const views = viewsRes.status === "fulfilled" ? viewsRes.value.count : 0;
          const waTaps = waTapsRes.status === "fulfilled" ? waTapsRes.value.count : 0;
          const leads = leadsRes.status === "fulfilled" ? leadsRes.value.count : 0;
          let statsMsg = `📊 *${label} — This Month*\n\n👁️ Profile Views: *${views || 0}*\n💬 WhatsApp Taps: *${waTaps || 0}*\n📩 Leads: *${leads || 0}*\n\nKeep sharing your link to grow! 🚀`;
          if (agencyCtx) {
            statsMsg += `\n\n👥 *Team: ${agencyCtx.agentIds.length} agents*`;
          }
          await sendWhatsAppReply(senderPhone, statsMsg);
          break;
        }

        case "get_leads":
          await handleGetLeads(senderPhone, agent.id, supabase, agencyCtx ?? undefined);
          break;

        case "share_property":
          await handleShareCommand(senderPhone, agent.id, agent.slug, intent.query, supabase);
          break;

        case "update_status":
          await handleUpdateStatus(senderPhone, agent.id, intent.query, intent.status, supabase);
          break;

        case "add_property": {
          const parsed = parsePropertyCaption(rawText);
          if (parsed.title && parsed.title.length > 3) {
            // Listing limit enforcement (same as image path)
            const effectiveTierText = resolveEffectiveTier(agent);
            const LISTING_LIMITS_TEXT: Record<string, number> = { free: 3, pro: 20, premium: Infinity };
            const limitText = LISTING_LIMITS_TEXT[effectiveTierText] ?? 3;
            if (limitText !== Infinity) {
              const { count: activeCountText } = await supabase
                .from("properties")
                .select("id", { count: "exact", head: true })
                .eq("agent_id", agent.id)
                .eq("is_active", true);
              if ((activeCountText ?? 0) >= limitText) {
                const upgradeMsg = effectiveTierText === "free"
                  ? `You've reached the ${limitText}-listing limit on the Free plan.\n\nUpgrade to Pro (AED 199/mo) for up to 20 listings, or Premium (AED 499/mo) for unlimited.\n\n👉 sellingdubai.ae/pricing`
                  : `You've reached the ${limitText}-listing limit on the Pro plan.\n\nUpgrade to Premium (AED 499/mo) for unlimited listings.\n\n👉 sellingdubai.ae/pricing`;
                await sendWhatsAppReply(senderPhone, upgradeMsg);
                break;
              }
            }
            const aiResult = await generateListingWithClaude(parsed, agent.name);
            const finalTitle = aiResult?.title || parsed.title;
            const { error: propErr } = await supabase
              .from("properties")
              .insert({
                agent_id: agent.id, title: finalTitle,
                description: aiResult?.description || null,
                property_type: parsed.type || null, bedrooms: parsed.bedrooms || null,
                location: parsed.area || null, features: parsed.features.length > 0 ? parsed.features : null,
                source: "whatsapp", is_active: true, status: "available",
              });
            if (!propErr) {
              let reply = `✅ Listed *${finalTitle}*\n\n💡 Send a photo next time for a better listing!`;
              if (aiResult?.igCaption) reply += `\n\n📸 *Instagram:*\n${aiResult.igCaption}`;
              await sendWhatsAppReply(senderPhone, reply);
            }
          } else {
            await sendWhatsAppReply(senderPhone, `Send a *photo with a caption* to list a property, or type *"help"* for commands.`);
          }
          break;
        }

        default: {
          const lowerText = rawText.toLowerCase();
          if (lowerText.includes("my link") || lowerText.includes("profile link")) {
            await sendWhatsAppReply(senderPhone,
              `Here's your profile link:\n\nhttps://sellingdubai.ae/a/${agent.slug}\n\nPaste it in your Instagram bio, WhatsApp status, or email signature.`
            );
          } else if (lowerText.includes("remove last") || lowerText.includes("delete last")) {
            const { data: lastProp } = await supabase
              .from("properties").select("id, title")
              .eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(1).single();
            if (lastProp) {
              await supabase.from("properties").delete().eq("id", lastProp.id).eq("agent_id", agent.id);
              await sendWhatsAppReply(senderPhone, `🗑️ Removed: *${lastProp.title}*`);
            } else {
              await sendWhatsAppReply(senderPhone, "No properties to remove.");
            }
          } else if (lowerText.includes("social") || lowerText.includes("template") || lowerText.includes("instagram") || lowerText.includes("tiktok")) {
            const { data: lastProp } = await supabase
              .from("properties").select("title, description, price, property_type, bedrooms, location, features")
              .eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(1).single();
            if (lastProp) {
              const parsedProp = {
                title: lastProp.title || '', price: lastProp.price ? `AED ${lastProp.price.toLocaleString()}` : null,
                type: lastProp.property_type, bedrooms: lastProp.bedrooms, bathrooms: null,
                area: lastProp.location, sqft: null, features: lastProp.features || [],
              };
              const aiResult = await generateListingWithClaude(parsedProp, agent.name);
              if (aiResult?.igCaption) {
                await sendWhatsAppReply(senderPhone, `📸 *Instagram caption for "${lastProp.title}":*\n\n${aiResult.igCaption}`);
              }
              if (aiResult?.tiktokCaption) {
                await sendWhatsAppReply(senderPhone, `🎬 *TikTok caption:*\n\n${aiResult.tiktokCaption}`);
              }
              if (!aiResult) {
                await sendWhatsAppReply(senderPhone, "Couldn't generate templates right now. Try again in a moment.");
              }
            } else {
              await sendWhatsAppReply(senderPhone, "No properties listed yet. Send a photo to create your first listing!");
            }
          } else {
            await sendWhatsAppReply(senderPhone, `Send a *photo with a caption* to list a property, or type *"help"* for commands.`);
          }
          break;
        }
      }

      log({ event: 'success', agent_id: agent.id, status: 200 });
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    log({ event: 'success', agent_id: agent.id, status: 200 });
    return new Response(JSON.stringify({ success: true }), { headers: CORS });
  } catch (_e) {
    log({ event: 'error', status: 200, error: String(_e) });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
