// edge-functions/sync-rem-offplan/index.ts
// Syncs Dubai off-plan projects from REM CRM API into developers + projects tables.
// Skips Out Of Stock projects and non-Dubai cities.
// Upserts on rem_id (projects) and slug (developers).
// For the top 30 priority-developer projects, fetches detail endpoint for enrichment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REM_LIST_URL   = "https://my.remapp.ae/api/public/websites_project_list";
const REM_DETAIL_URL = "https://my.remapp.ae/api/public/websites_project_detail";

const PRIORITY_DEVS = [
  "emaar", "sobha", "omniyat", "nakheel", "ellington",
  "meraas", "damac", "binghatti", "aldar", "dubai properties",
];

// REM status → projects.status (CHECK constraint values)
const STATUS_MAP: Record<string, string> = {
  "Announced":    "off_plan",
  "Pre Sale":     "off_plan",
  "On Sale":      "under_construction",
  "Out Of Stock": "sold_out",
};

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function parseLatLng(latLong: string | null): { lat: number | null; lng: number | null } {
  if (!latLong) return { lat: null, lng: null };
  const parts = latLong.split(",");
  if (parts.length !== 2) return { lat: null, lng: null };
  const lat = parseFloat(parts[0]);
  const lng  = parseFloat(parts[1]);
  return { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng };
}

interface RemProject {
  id: number;
  title: string;
  developer_name: string;
  developer_image: string | null;
  status: string;
  city_name: string | null;
  district_name: string | null;
  location: string | null;
  lat_long: string;
  min_price: number;
  max_price: number;
  min_area: string | null;
  max_area: string | null;
  beds: string | null;
  property_category: string[];
  expected_delivery_date: string | null;
  feature_image: string | null;
  meta_description: string | null;
  currency: string;
}

interface RemPaymentMilestone {
  phase: string;
  percentage: number;
  trigger: string;
  due_date: string | null;
}

interface RemDetailData {
  all_images?: string[] | null;
  images?: {
    interior?: string[] | null;
    exterior?: string[] | null;
    general?:  string[] | null;
    other?:    string[] | null;
  } | null;
  new_payment_plans?: RemPaymentMilestone[] | null;
  typical_units?: unknown[] | null;
  description?: string | null;
  facilities?: { id: number; name: string; description?: string | null; image?: string | null }[] | null;
  nearby_locations?: { id: number; name: string; distance?: string | null }[] | null;
  attachments?: { attachment_title?: string; attachment_url?: string; file_type?: string }[] | null;
}

// Fetch REM detail for a single project; returns null on any failure.
async function fetchDetail(remId: string, token: string): Promise<RemDetailData | null> {
  try {
    const res = await fetch(REM_DETAIL_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fk_project_id: remId }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.status === true ? (json.data as RemDetailData) : null;
  } catch {
    return null;
  }
}

// Run promises in batches to avoid rate limiting.
async function batchRun<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("cron_secret") || "";
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const url         = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";
  const authHeader  = req.headers.get("authorization") || "";
  const cronHeader  = req.headers.get("x-cron-secret") || "";
  const isAuthorized =
    querySecret === cronSecret ||
    authHeader  === `Bearer ${cronSecret}` ||
    cronHeader  === cronSecret;
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const remToken = Deno.env.get("REM_API_TOKEN");
  if (!remToken) {
    return new Response(JSON.stringify({ error: "REM_API_TOKEN not configured." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const syncStarted = new Date().toISOString();

  // ── 1. Fetch from REM list endpoint ──────────────────────────────────────────
  let remData: { status: boolean; data: RemProject[] };
  try {
    const remRes = await fetch(REM_LIST_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${remToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ per_page: "all" }),
    });
    if (!remRes.ok) throw new Error(`REM API returned ${remRes.status}`);
    remData = await remRes.json();
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: "REM API fetch failed." }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  if (!remData.status || !Array.isArray(remData.data)) {
    return new Response(JSON.stringify({ error: "Unexpected REM API response shape." }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  // ── 2. Filter: Dubai only, exclude Out Of Stock, deduplicate by id ───────────
  const seenIds = new Set<number>();
  const eligible = remData.data.filter((p) => {
    if (p.city_name !== "Dubai" || p.status === "Out Of Stock") return false;
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  // ── 3. Identify top-30 priority projects for enrichment ──────────────────────
  const isPriority = (p: RemProject) =>
    PRIORITY_DEVS.some(d => p.developer_name.toLowerCase().includes(d));

  const prioritySorted = eligible
    .filter(isPriority)
    .sort((a, b) => (b.min_price ?? 0) - (a.min_price ?? 0))
    .slice(0, 30);

  const priorityRemIds = new Set(prioritySorted.map(p => String(p.id)));

  // ── 4. Fetch detail for the top 30 (5 concurrent to avoid rate limits) ───────
  const enrichmentMap = new Map<string, RemDetailData>();
  await batchRun(prioritySorted, 5, async (p) => {
    const detail = await fetchDetail(String(p.id), remToken);
    if (detail) enrichmentMap.set(String(p.id), detail);
  });

  // ── 5. Upsert developers ─────────────────────────────────────────────────────
  const devMap = new Map<string, { name: string; logo_url: string | null }>();
  for (const p of eligible) {
    const slug = slugify(p.developer_name);
    if (!devMap.has(slug)) devMap.set(slug, { name: p.developer_name, logo_url: p.developer_image ?? null });
  }
  const devRows = Array.from(devMap.entries()).map(([slug, d]) => ({ slug, name: d.name, logo_url: d.logo_url }));
  const { error: devErr } = await sb.from("developers").upsert(devRows, { onConflict: "slug", ignoreDuplicates: false });
  if (devErr) {
    return new Response(JSON.stringify({ error: 'Sync error. Check logs.' }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const devSlugs = devRows.map(d => d.slug);
  const { data: devRecords, error: devFetchErr } = await sb.from("developers").select("id, slug").in("slug", devSlugs);
  if (devFetchErr || !devRecords) {
    return new Response(JSON.stringify({ error: 'Sync error. Check logs.' }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const devIdBySlug = new Map<string, string>(devRecords.map((d: { id: string; slug: string }) => [d.slug, d.id]));

  // ── 6. Build project rows ─────────────────────────────────────────────────────
  const remIds = eligible.map(p => String(p.id));
  const { data: existingRows } = await sb.from("projects").select("rem_id, slug").in("rem_id", remIds);
  const existingSlugByRemId = new Map<string, string>(
    (existingRows ?? []).map((r: { rem_id: string; slug: string }) => [r.rem_id, r.slug]),
  );
  const { data: allSlugs } = await sb.from("projects").select("slug");
  const usedSlugs = new Set<string>((allSlugs ?? []).map((r: { slug: string }) => r.slug));

  const projectRows = eligible.map((p) => {
    const devSlug     = slugify(p.developer_name);
    const developerId = devIdBySlug.get(devSlug) ?? null;
    const remId       = String(p.id);

    let slug = existingSlugByRemId.get(remId) ?? "";
    if (!slug) {
      let baseSlug = slugify(p.title) || "project";
      slug = baseSlug;
      let i = 1;
      while (usedSlugs.has(slug)) slug = `${baseSlug}-${i++}`;
    }
    usedSlugs.add(slug);

    const { lat, lng } = parseLatLng(p.lat_long);

    // Base row — no enrichment columns (avoids overwriting them for non-priority projects)
    const base = {
      rem_id:         remId,
      slug,
      name:           p.title,
      developer_id:   developerId,
      description:    p.meta_description ?? null,
      location:       p.location ?? null,
      area:           p.district_name ?? null,
      district_name:  p.district_name ?? null,
      cover_image_url: p.feature_image ?? null,
      min_price:      p.min_price,
      max_price:      p.max_price || null,
      min_area_sqft:  p.min_area ? parseFloat(p.min_area) : null,
      max_area_sqft:  p.max_area ? parseFloat(p.max_area) : null,
      beds:           p.beds ?? null,
      property_types: Array.isArray(p.property_category) && p.property_category.length > 0
                        ? p.property_category : null,
      lat,
      lng,
      completion_date: p.expected_delivery_date ?? null,
      status:          STATUS_MAP[p.status] ?? "off_plan",
      synced_at:       syncStarted,
    };

    if (!priorityRemIds.has(remId)) return base;

    // Enrichment — only for top-30 priority projects
    const detail = enrichmentMap.get(remId);
    const galleryAll: string[] = Array.isArray(detail?.all_images) ? detail!.all_images! : [];
    const galleryImages  = galleryAll.filter(u => u && u !== p.feature_image);
    const floorPlanUrls  = Array.isArray(detail?.images?.general) ? detail!.images!.general!.filter(Boolean) : [];
    const paymentPlanDetail = Array.isArray(detail?.new_payment_plans) && detail!.new_payment_plans!.length > 0
      ? detail!.new_payment_plans!.map((plan) => ({
          phase:      String(plan.phase      ?? 'Phase'),
          percentage: Number(plan.percentage ?? 0),
          trigger:    String(plan.trigger    ?? 'on_booking'),
          due_date:   plan.due_date          ?? null,
        }))
      : null;
    const availableUnits = Array.isArray(detail?.typical_units) && detail!.typical_units!.length > 0
      ? detail!.typical_units
      : null;
    const description = detail?.description ?? null;
    const facilities = Array.isArray(detail?.facilities) && detail!.facilities!.length > 0
      ? detail!.facilities!.map(f => ({ name: f.name, image: f.image ?? null }))
      : null;
    const nearbyLocations = Array.isArray(detail?.nearby_locations) && detail!.nearby_locations!.length > 0
      ? detail!.nearby_locations!.map(l => ({ name: l.name, distance: l.distance ?? null }))
      : null;
    const brochureUrl = Array.isArray(detail?.attachments)
      ? (detail!.attachments!.find(a => a.file_type === "pdf")?.attachment_url ?? null)
      : null;
    const imagesCategorized = {
      interior: detail?.images?.interior?.filter(Boolean) ?? [],
      exterior: detail?.images?.exterior?.filter(Boolean) ?? [],
      general:  detail?.images?.general?.filter(Boolean)  ?? [],
      other:    detail?.images?.other?.filter(Boolean)    ?? [],
    };

    return {
      ...base,
      description,
      gallery_images:      galleryImages.length > 0 ? galleryImages : null,
      floor_plan_urls:     floorPlanUrls.length  > 0 ? floorPlanUrls : null,
      payment_plan_detail: paymentPlanDetail,
      available_units:     availableUnits,
      facilities,
      nearby_locations:    nearbyLocations,
      brochure_url:        brochureUrl,
      images_categorized:  imagesCategorized,
    };
  });

  // ── 7. Upsert projects in batches of 200 ─────────────────────────────────────
  const BATCH_SIZE = 200;
  let projectsNew = 0, projectsUpdated = 0;

  const batchRemIds = projectRows.map(r => r.rem_id);
  const { data: existing } = await sb.from("projects").select("rem_id").in("rem_id", batchRemIds);
  const existingRemIds = new Set((existing ?? []).map((r: { rem_id: string }) => r.rem_id));

  for (let offset = 0; offset < projectRows.length; offset += BATCH_SIZE) {
    const seenBatchRemIds  = new Set<string>();
    const seenBatchSlugs   = new Set<string>();
    const batch = projectRows.slice(offset, offset + BATCH_SIZE).filter((row) => {
      if (seenBatchRemIds.has(row.rem_id) || seenBatchSlugs.has(row.slug)) return false;
      seenBatchRemIds.add(row.rem_id);
      seenBatchSlugs.add(row.slug);
      return true;
    });

    const { error: projErr } = await sb.from("projects").upsert(batch, { onConflict: "rem_id", ignoreDuplicates: false });
    if (projErr) {
      return new Response(
        JSON.stringify({ error: 'Sync error. Check logs.' }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    for (const row of batch) {
      if (existingRemIds.has(row.rem_id)) projectsUpdated++;
      else projectsNew++;
    }
  }

  // ── 8. Return summary ─────────────────────────────────────────────────────────
  return new Response(JSON.stringify({
    synced_at:             syncStarted,
    total_from_api:        remData.data.length,
    dubai_active:          eligible.length,
    developers_upserted:   devRows.length,
    projects_synced:       projectRows.length,
    projects_new:          projectsNew,
    projects_updated:      projectsUpdated,
    priority_enriched:     enrichmentMap.size,
    priority_requested:    prioritySorted.length,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
