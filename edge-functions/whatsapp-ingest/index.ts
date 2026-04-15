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
import { rateLimitByKey } from '../_shared/rate-limit.ts';

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
        model: "claude-sonnet-4-6",
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

// ── Profile Photo Update ──
async function handleProfilePhotoUpdate(
  senderPhone: string,
  agent: { id: string; slug: string },
  mediaId: string,
  supabase: ReturnType<typeof createClient>,
) {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!WA_TOKEN) {
    await sendWhatsAppReply(senderPhone, "Photo upload unavailable. Please try again later.");
    return;
  }
  try {
    const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    });
    if (!mediaRes.ok) throw new Error("media fetch failed");
    const mediaData = await mediaRes.json();
    if (!mediaData.url) throw new Error("no media url");

    const imgRes = await fetch(mediaData.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
    if (!imgRes.ok) throw new Error("image download failed");
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    const photoPath = `agents/${agent.id}/photo.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("agent-images")
      .upload(photoPath, imgBytes, { contentType, upsert: true });
    if (uploadErr) throw new Error("upload failed");

    const { data: urlData } = supabase.storage.from("agent-images").getPublicUrl(photoPath);
    await supabase.from("agents").update({ photo_url: urlData.publicUrl }).eq("id", agent.id);

    await sendWhatsAppReply(
      senderPhone,
      `✅ Profile photo updated!\n\nView your profile: https://sellingdubai.ae/a/${agent.slug}`,
    );
  } catch (_e) {
    await sendWhatsAppReply(senderPhone, "Failed to update profile photo. Please try again.");
  }
}

// ── WhatsApp Onboarding (unknown numbers) ──
function slugifyName(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function saveOnboardingState(
  agentId: string,
  state: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
) {
  await supabase.from("whatsapp_sessions").upsert(
    { agent_id: agentId, turns: [{ role: "onboarding", content: JSON.stringify(state) }], last_active: new Date().toISOString() },
    { onConflict: "agent_id" },
  );
}

async function startOnboarding(
  senderPhone: string,
  cleanPhone: string,
  supabase: ReturnType<typeof createClient>,
) {
  const provisionalSlug = `wa-pending-${crypto.randomUUID().slice(0, 12)}`;
  const { data: newAgent, error: insertErr } = await supabase
    .from("agents")
    .insert({
      name: "Pending",
      slug: provisionalSlug,
      whatsapp: `+${cleanPhone}`,
      is_active: false,
      email_verified: false,
      verification_status: "pending_registration",
      tier: "free",
    })
    .select("id, slug")
    .single();

  if (insertErr || !newAgent) {
    await sendWhatsAppReply(senderPhone, "Something went wrong. Please visit sellingdubai.ae/join to register.");
    return;
  }

  const state = { step: "awaiting_name", data: {} };
  await saveOnboardingState(newAgent.id, state, supabase);
  await sendWhatsAppReply(
    senderPhone,
    "👋 *Welcome to SellingDubai!*\n\nI'll help you set up your agent profile in a few quick steps.\n\nWhat's your full name?",
  );
}

async function completeOnboarding(
  senderPhone: string,
  agentId: string,
  provisionalSlug: string,
  state: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
) {
  let realSlug = slugifyName(state.data.name);
  const { data: slugCheck } = await supabase
    .from("agents").select("id").eq("slug", realSlug).neq("id", agentId).limit(1);
  if (slugCheck && slugCheck.length > 0) {
    realSlug = `${realSlug}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  const updates: Record<string, unknown> = {
    name: state.data.name,
    slug: realSlug,
    email: state.data.email,
    email_verified: true,
    is_active: true,
    referral_code: realSlug,
    verification_status: state.data.is_auto_verified ? "verified" : "pending",
    ...(state.data.broker_number ? {
      broker_number: state.data.broker_number,
      dld_broker_number: String(state.data.broker_number),
      dld_broker_id: state.data.dld_broker_id || null,
    } : {}),
    ...(state.data.is_auto_verified ? {
      license_verified: true,
      dld_verified: true,
      verified_at: new Date().toISOString(),
    } : { license_verified: false, dld_verified: false }),
  };

  const { error: updateErr } = await supabase.from("agents").update(updates).eq("id", agentId);
  if (updateErr) {
    await sendWhatsAppReply(senderPhone, "Something went wrong. Please visit sellingdubai.ae/join to complete registration.");
    return;
  }

  const editToken = crypto.randomUUID();
  await supabase.from("magic_links").insert({
    agent_id: agentId,
    token: editToken,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Clear onboarding session so AI secretary can take over
  await supabase.from("whatsapp_sessions").delete().eq("agent_id", agentId);

  const profileUrl = `https://sellingdubai.ae/a/${realSlug}`;
  const dashboardUrl = `https://sellingdubai.ae/edit?token=${editToken}`;

  const msg = state.data.is_auto_verified
    ? `🎉 *You're live on SellingDubai!*\n\n🔗 Your profile:\n${profileUrl}\n\n📊 Dashboard:\n${dashboardUrl}\n\nShare your profile link to start getting leads!`
    : `✅ *Profile created!*\n\nOur team will verify your profile within 24 hours.\n\n📊 Dashboard:\n${dashboardUrl}\n\nWe'll message you when you go live.`;
  await sendWhatsAppReply(senderPhone, msg);

  // Welcome email (fire-and-forget)
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
  if (RESEND_KEY && state.data.email) {
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "SellingDubai <noreply@sellingdubai.ae>",
        to: [state.data.email],
        subject: state.data.is_auto_verified ? "You're live on SellingDubai!" : "Profile under review — SellingDubai",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;"><h1 style="font-size:22px;color:#111;">Hi ${state.data.name}!</h1><p style="color:#555;">Your SellingDubai profile is ready.</p><a href="${dashboardUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;margin-top:16px;">Open Dashboard</a></div>`,
      }),
    }).catch(() => {});
  }
}

async function handleOnboardingStep(
  senderPhone: string,
  agent: { id: string; slug: string; name: string },
  text: string,
  supabase: ReturnType<typeof createClient>,
) {
  const { data: session } = await supabase
    .from("whatsapp_sessions").select("turns").eq("agent_id", agent.id).single();

  const turns = session?.turns || [];
  const stateTurn = turns.find((t: any) => t.role === "onboarding");
  if (!stateTurn) {
    // Session lost — clean up and restart
    await supabase.from("agents").delete().eq("id", agent.id);
    await sendWhatsAppReply(senderPhone, "Session expired. Text *JOIN* to start again.");
    return;
  }

  const state = JSON.parse(stateTurn.content);
  const trimmed = text.trim();

  if (state.step === "awaiting_name") {
    if (trimmed.length < 2) {
      await sendWhatsAppReply(senderPhone, "Please enter your full name.");
      return;
    }
    state.data.name = trimmed;
    state.step = "awaiting_brn";
    await saveOnboardingState(agent.id, state, supabase);
    await sendWhatsAppReply(senderPhone, `Nice to meet you, *${trimmed}*! 👋\n\nWhat's your RERA/DLD broker number? (Reply *SKIP* to add it later)`);
    return;
  }

  if (state.step === "awaiting_brn") {
    if (!/^skip$/i.test(trimmed)) {
      const brnNum = parseInt(trimmed.replace(/\D/g, ""), 10);
      if (isNaN(brnNum)) {
        await sendWhatsAppReply(senderPhone, "Please enter your broker number (digits only), or reply *SKIP*.");
        return;
      }
      const { data: dldBroker } = await supabase
        .from("dld_brokers").select("id, license_end_date").eq("broker_number", brnNum).single();
      state.data.broker_number = brnNum;
      if (dldBroker) {
        const licenseValid = dldBroker.license_end_date ? new Date(dldBroker.license_end_date) > new Date() : false;
        state.data.dld_broker_id = dldBroker.id;
        state.data.is_auto_verified = licenseValid;
        const verifiedMsg = licenseValid ? "✅ DLD license verified!" : "Found your record — we'll verify manually.";
        await sendWhatsAppReply(senderPhone, `${verifiedMsg}\n\nWhat's your email address? We'll send your dashboard login link there.`);
      } else {
        await sendWhatsAppReply(senderPhone, "Broker number noted. Our team will verify it.\n\nWhat's your email address?");
      }
    } else {
      await sendWhatsAppReply(senderPhone, "No problem! What's your email address? We'll send your dashboard login link there.");
    }
    state.step = "awaiting_email";
    await saveOnboardingState(agent.id, state, supabase);
    return;
  }

  if (state.step === "awaiting_email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      await sendWhatsAppReply(senderPhone, "Please enter a valid email address (e.g. john@gmail.com).");
      return;
    }
    const cleanEmail = trimmed.toLowerCase();
    const { data: existing } = await supabase
      .from("agents").select("id").eq("email", cleanEmail).neq("id", agent.id).limit(1);
    if (existing && existing.length > 0) {
      await sendWhatsAppReply(senderPhone, "That email is already registered. Please use a different one.");
      return;
    }
    state.data.email = cleanEmail;
    state.step = "awaiting_confirm";
    await saveOnboardingState(agent.id, state, supabase);
    const brnLine = state.data.broker_number ? `\n🪪 BRN: ${state.data.broker_number}` : "";
    const verifiedLine = state.data.is_auto_verified ? "\n✅ DLD Verified" : "";
    await sendWhatsAppReply(
      senderPhone,
      `*Almost done!* Here's your profile:\n\n👤 ${state.data.name}${brnLine}${verifiedLine}\n📧 ${cleanEmail}\n\nReply *CONFIRM* to go live, or *CANCEL* to start over.`,
    );
    return;
  }

  if (state.step === "awaiting_confirm") {
    if (/^confirm$/i.test(trimmed)) {
      await completeOnboarding(senderPhone, agent.id, agent.slug, state, supabase);
    } else if (/^cancel$/i.test(trimmed)) {
      await supabase.from("agents").delete().eq("id", agent.id);
      await sendWhatsAppReply(senderPhone, "Registration cancelled. Text *JOIN* any time to start again, or visit sellingdubai.ae/join");
    } else {
      await sendWhatsAppReply(senderPhone, "Reply *CONFIRM* to create your profile, or *CANCEL* to start over.");
    }
    return;
  }
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

// ── Whisper Audio Transcription ──
async function transcribeAudio(mediaId: string): Promise<string | null> {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!WA_TOKEN || !OPENAI_KEY) return null;

  try {
    // 1. Get media URL from WhatsApp
    const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    });
    if (!mediaRes.ok) return null;
    const mediaData = await mediaRes.json();
    if (!mediaData.url) return null;

    // 2. Download the audio
    const audioRes = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    });
    if (!audioRes.ok) return null;
    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
    const contentType = audioRes.headers.get("content-type") || "audio/ogg";
    const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : "ogg";

    // 3. Send to OpenAI Whisper
    const form = new FormData();
    form.append("file", new Blob([audioBytes], { type: contentType }), `audio.${ext}`);
    form.append("model", "whisper-1");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    if (!whisperRes.ok) return null;
    const whisperData = await whisperRes.json();
    return (whisperData.text as string) || null;
  } catch (_e) {
    return null;
  }
}

// ── AI Secretary Routing ──
async function routeToSecretary(
  senderPhone: string,
  agentId: string,
  message: string,
): Promise<void> {
  const SECRETARY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-secretary`;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    await sendWhatsAppReply(senderPhone, "Configuration error. Please try again later.");
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    try {
      const res = await fetch(SECRETARY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ agent_id: agentId, message, channel: "whatsapp" }),
      });

      if (!res.ok) {
        await sendWhatsAppReply(senderPhone, "I couldn't process that right now. Try again in a moment.");
        return;
      }

      const data = await res.json();
      if (data.reply) {
        await sendWhatsAppReply(senderPhone, data.reply);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (_e) {
    await sendWhatsAppReply(senderPhone, "I couldn't process that right now. Try again in a moment.");
  }
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

// Meta's published webhook IP ranges (updated 2025-04).
// Source: https://developers.facebook.com/docs/messenger-platform/webhooks
// Defense-in-depth: the primary auth is X-Hub-Signature-256 HMAC verification below.
// Note: CORS headers are intentionally absent — this endpoint only receives
// server-to-server POST requests from Meta's infrastructure. CORS governs
// browser-initiated cross-origin requests; it has no effect here and a wildcard
// Access-Control-Allow-Origin would be misleading and unnecessary.
const META_WEBHOOK_CIDRS = [
  '31.13.24.0/21',
  '31.13.64.0/18',
  '45.64.40.0/22',
  '66.220.144.0/20',
  '69.63.176.0/20',
  '69.171.224.0/19',
  '74.119.76.0/22',
  '103.4.96.0/22',
  '129.134.0.0/17',
  '157.240.0.0/17',
  '173.252.64.0/18',
  '179.60.192.0/22',
  '185.60.216.0/22',
  '204.15.20.0/22',
];

function ipToInt(ip: string): number {
  const p = ip.split('.').map(Number);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function isInCidr(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const prefix = Number(bits);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

function isMetaIp(raw: string): boolean {
  if (!raw) return false;
  const ip = raw.split(',')[0].trim(); // X-Forwarded-For may be comma-separated
  if (ip.includes(':')) return false;  // skip IPv6 — Meta uses IPv4 for webhooks
  return META_WEBHOOK_CIDRS.some(cidr => isInCidr(ip, cidr));
}

const CORS = {
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

  // IP allowlisting — only accept requests from Meta's webhook infrastructure.
  // Cloudflare sets CF-Connecting-IP; fall back to X-Forwarded-For on other proxies.
  const clientIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '';
  if (!isMetaIp(clientIp)) {
    log({ event: 'ip_blocked', status: 403, ip: clientIp.slice(0, 45) });
    return new Response('Forbidden', { status: 403 });
  }

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

    // Per-phone rate limit: max 20 messages per 60 seconds (distributed, via Upstash)
    const { limited: phoneRateLimited } = await rateLimitByKey(`rate:whatsapp:${cleanPhone}`, 20, 60);
    if (phoneRateLimited) {
      log({ event: 'rate_limit_exceeded', status: 429 });
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, slug, whatsapp, tier, stripe_subscription_status, stripe_current_period_end, verification_status")
      .or(`whatsapp.eq.${cleanPhone},whatsapp.eq.+${cleanPhone},whatsapp.ilike.%${cleanPhone.slice(-9)}`)
      .maybeSingle();

    if (agentErr || !agent) {
      // No registered agent — start WhatsApp onboarding for text, redirect otherwise
      if (msgType === "text") {
        await startOnboarding(senderPhone, cleanPhone, supabase);
      } else {
        await sendWhatsAppReply(senderPhone, "👋 Text *JOIN* to create your SellingDubai agent profile, or visit sellingdubai.ae/join");
      }
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // Agent has a WhatsApp onboarding in progress — route all text input to the onboarding handler
    if (agent.verification_status === "pending_registration") {
      if (msgType === "text") {
        const rawText = msg.text?.body || "";
        await handleOnboardingStep(senderPhone, agent, rawText, supabase);
      }
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // === HANDLE INTERACTIVE BUTTON REPLY ===
    if (msgType === "interactive") {
      const buttonReply = msg.interactive?.button_reply;
      if (!buttonReply?.id) {
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      const [action, leadId] = buttonReply.id.split("_").reduce(
        (acc: [string, string], part: string, i: number) =>
          i === 0 ? [part, ""] : [acc[0], acc[1] ? `${acc[1]}_${part}` : part],
        ["", ""],
      );

      if ((action === "contacted" || action === "archive") && leadId) {
        const newStatus = action === "contacted" ? "contacted" : "archived";
        const { error } = await supabase
          .from("leads")
          .update({ status: newStatus })
          .eq("id", leadId)
          .eq("agent_id", agent.id);

        const replyText = error
          ? "Couldn't update the lead. Try again."
          : action === "contacted"
            ? "✓ Lead marked as contacted."
            : "✗ Lead archived.";
        await sendWhatsAppReply(senderPhone, replyText);
      } else if (action === "view" && leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("name, phone, email, budget_range, preferred_area, message, status, created_at")
          .eq("id", leadId)
          .eq("agent_id", agent.id)
          .single();

        if (lead) {
          const lines = [
            `👤 *${lead.name}*`,
            lead.phone ? `📞 ${lead.phone}` : null,
            lead.email ? `✉️ ${lead.email}` : null,
            lead.budget_range ? `💰 ${lead.budget_range}` : null,
            lead.preferred_area ? `📍 ${lead.preferred_area}` : null,
            lead.message ? `💬 ${lead.message.slice(0, 200)}` : null,
            `Status: ${lead.status}`,
          ].filter(Boolean).join("\n");
          await sendWhatsAppReply(senderPhone, lines);
        } else {
          await sendWhatsAppReply(senderPhone, "Lead not found.");
        }
      }

      log({ event: "button_reply_handled", agent_id: agent.id, action, status: 200 });
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // === HANDLE IMAGE MESSAGE ===
    if (msgType === "image") {
      const imageId = msg.image?.id;
      const caption = msg.image?.caption || "";

      // Detect profile photo update intent — routes away from property listing flow
      if (/\b(profile|headshot|my photo|update photo|change photo|profile pic|pfp)\b/i.test(caption)) {
        if (imageId) {
          await handleProfilePhotoUpdate(senderPhone, agent, imageId, supabase);
        }
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

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

    // === HANDLE AUDIO MESSAGE (voice notes) ===
    if (msgType === "audio") {
      const audioId = msg.audio?.id;
      if (!audioId) {
        await sendWhatsAppReply(senderPhone, "Couldn't process that voice note. Please try again.");
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      await sendWhatsAppReply(senderPhone, "🎙️ Processing your voice note...");
      const transcript = await transcribeAudio(audioId);

      if (!transcript?.trim()) {
        await sendWhatsAppReply(senderPhone, "Couldn't transcribe the voice note. Please type your message instead.");
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      await routeToSecretary(senderPhone, agent.id, transcript);
      log({ event: "voice_note_processed", agent_id: agent.id, status: 200 });
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // === HANDLE TEXT MESSAGE (route to AI secretary) ===
    if (msgType === "text") {
      const rawText = msg.text?.body || "";
      if (!rawText.trim()) {
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }
      await routeToSecretary(senderPhone, agent.id, rawText);
      log({ event: "text_routed_to_secretary", agent_id: agent.id, status: 200 });
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
