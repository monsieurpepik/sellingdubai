// edge-functions/sync-rem-offplan/index.ts
// Syncs Dubai off-plan projects from REM CRM API into developers + projects tables.
// Skips Out Of Stock projects and non-Dubai cities.
// Upserts on rem_id (projects) and slug (developers).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REM_API_URL = "https://my.remapp.ae/api/public/websites_project_list";

// REM status → projects.status (CHECK constraint values)
const STATUS_MAP: Record<string, string> = {
  "Announced": "off_plan",
  "Pre Sale": "off_plan",
  "On Sale": "under_construction",
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
  const lng = parseFloat(parts[1]);
  return {
    lat: isNaN(lat) ? null : lat,
    lng: isNaN(lng) ? null : lng,
  };
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

Deno.serve(async (req: Request) => {
  // Only allow POST or scheduled invocations
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const remToken = Deno.env.get("REM_API_TOKEN");
  if (!remToken) {
    return new Response(JSON.stringify({ error: "REM_API_TOKEN not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const syncStarted = new Date().toISOString();

  // ── 1. Fetch from REM API ─────────────────────────────────────────────────
  let remData: { status: boolean; data: RemProject[] };
  try {
    const remRes = await fetch(REM_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${remToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ per_page: "all" }),
    });
    if (!remRes.ok) {
      throw new Error(`REM API returned ${remRes.status}`);
    }
    remData = await remRes.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `REM API fetch failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!remData.status || !Array.isArray(remData.data)) {
    return new Response(JSON.stringify({ error: "Unexpected REM API response shape." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 2. Filter: Dubai only, exclude Out Of Stock, deduplicate by id ──────────
  const seenIds = new Set<number>();
  const eligible = remData.data.filter((p) => {
    if (p.city_name !== "Dubai" || p.status === "Out Of Stock") return false;
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  // ── 3. Upsert developers (by slug, keyed on developer_name) ───────────────
  // Collect unique developers
  const devMap = new Map<string, { name: string; logo_url: string | null }>();
  for (const p of eligible) {
    const slug = slugify(p.developer_name);
    if (!devMap.has(slug)) {
      devMap.set(slug, { name: p.developer_name, logo_url: p.developer_image ?? null });
    }
  }

  const devRows = Array.from(devMap.entries()).map(([slug, d]) => ({
    slug,
    name: d.name,
    logo_url: d.logo_url,
  }));

  // Upsert developers — conflict on slug, update logo_url if changed
  const { error: devErr } = await sb
    .from("developers")
    .upsert(devRows, { onConflict: "slug", ignoreDuplicates: false });

  if (devErr) {
    return new Response(JSON.stringify({ error: `Developer upsert failed: ${devErr.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch all developer id→slug mappings we just upserted
  const devSlugs = devRows.map((d) => d.slug);
  const { data: devRecords, error: devFetchErr } = await sb
    .from("developers")
    .select("id, slug")
    .in("slug", devSlugs);

  if (devFetchErr || !devRecords) {
    return new Response(JSON.stringify({ error: `Developer fetch failed: ${devFetchErr?.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const devIdBySlug = new Map<string, string>(
    devRecords.map((d: { id: string; slug: string }) => [d.slug, d.id]),
  );

  // ── 4. Build project rows ─────────────────────────────────────────────────
  // Fetch existing rem_id → slug mappings so we can:
  //   a) reuse existing slugs for updates (URL stability)
  //   b) pre-seed usedSlugs so new projects never collide with existing ones
  const remIds = eligible.map((p) => String(p.id));
  const { data: existingRows } = await sb
    .from("projects")
    .select("rem_id, slug")
    .in("rem_id", remIds);

  const existingSlugByRemId = new Map<string, string>(
    (existingRows ?? []).map((r: { rem_id: string; slug: string }) => [r.rem_id, r.slug]),
  );

  // Seed usedSlugs with ALL currently existing slugs so new projects can't
  // collide with any existing row (regardless of whether it's in this batch).
  // We only need the slugs for rem_ids NOT in this sync set, but seeding all
  // is safe — existing projects bypass the loop by reusing their stored slug.
  const { data: allSlugs } = await sb.from("projects").select("slug");
  const usedSlugs = new Set<string>((allSlugs ?? []).map((r: { slug: string }) => r.slug));

  const projectRows = eligible.map((p) => {
    const devSlug = slugify(p.developer_name);
    const developerId = devIdBySlug.get(devSlug) ?? null;
    const remId = String(p.id);

    // Reuse the existing slug for known projects (preserves URLs).
    // Generate a new unique slug only for genuinely new projects.
    let slug = existingSlugByRemId.get(remId) ?? "";
    if (!slug) {
      let baseSlug = slugify(p.title) || "project";
      slug = baseSlug;
      let i = 1;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${i++}`;
      }
    }
    usedSlugs.add(slug);

    const { lat, lng } = parseLatLng(p.lat_long);

    return {
      rem_id: String(p.id),
      slug,
      name: p.title,
      developer_id: developerId,
      description: p.meta_description ?? null,
      location: p.location ?? null,
      area: p.district_name ?? null,
      district_name: p.district_name ?? null,
      cover_image_url: p.feature_image ?? null,
      min_price: p.min_price,
      max_price: p.max_price,
      min_area_sqft: p.min_area ? parseFloat(p.min_area) : null,
      max_area_sqft: p.max_area ? parseFloat(p.max_area) : null,
      beds: p.beds ?? null,
      property_types: Array.isArray(p.property_category) && p.property_category.length > 0
        ? p.property_category
        : null,
      lat,
      lng,
      completion_date: p.expected_delivery_date ?? null,
      status: STATUS_MAP[p.status] ?? "off_plan",
      synced_at: syncStarted,
    };
  });

  // ── 5. Upsert projects in batches of 200 ─────────────────────────────────
  // Conflict on rem_id — update everything except id, created_at, and slug
  // (slug is preserved on update so existing URLs don't break)
  const BATCH_SIZE = 200;
  let projectsNew = 0;
  let projectsUpdated = 0;

  // Get existing rem_ids to distinguish new vs updated
  const batchRemIds = projectRows.map((r) => r.rem_id);
  const { data: existing } = await sb
    .from("projects")
    .select("rem_id")
    .in("rem_id", batchRemIds);

  const existingRemIds = new Set((existing ?? []).map((r: { rem_id: string }) => r.rem_id));

  for (let offset = 0; offset < projectRows.length; offset += BATCH_SIZE) {
    // Deduplicate within batch by rem_id then by slug (keep first occurrence)
    const seenBatchRemIds = new Set<string>();
    const seenBatchSlugs = new Set<string>();
    const batch = projectRows.slice(offset, offset + BATCH_SIZE).filter((row) => {
      if (seenBatchRemIds.has(row.rem_id) || seenBatchSlugs.has(row.slug)) return false;
      seenBatchRemIds.add(row.rem_id);
      seenBatchSlugs.add(row.slug);
      return true;
    });

    const { error: projErr } = await sb
      .from("projects")
      .upsert(batch, {
        onConflict: "rem_id",
        ignoreDuplicates: false,
      });

    if (projErr) {
      return new Response(
        JSON.stringify({
          error: `Project upsert failed at batch ${offset / BATCH_SIZE + 1}: ${projErr.message}`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    for (const row of batch) {
      if (existingRemIds.has(row.rem_id)) {
        projectsUpdated++;
      } else {
        projectsNew++;
      }
    }
  }

  // ── 6. Return summary ─────────────────────────────────────────────────────
  const summary = {
    synced_at: syncStarted,
    total_from_api: remData.data.length,
    dubai_active: eligible.length,
    developers_upserted: devRows.length,
    projects_synced: projectRows.length,
    projects_new: projectsNew,
    projects_updated: projectsUpdated,
  };

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
