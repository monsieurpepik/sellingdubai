import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

function resolveEffectiveTier(agent: {
  tier?: string;
  stripe_subscription_status?: string;
  stripe_current_period_end?: string;
}): string {
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

function tierLimit(tier: string): number | null {
  if (tier === "premium") return null;
  if (tier === "pro") return 20;
  return 3;
}

const PROP_SELECT =
  "id, title, price, location, bedrooms, area_sqft, property_type, status, image_url, dld_permit, external_url, sort_order, created_at, additional_photos, is_active";

async function uploadPropertyImage(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  base64Data: string,
): Promise<string | null> {
  const match = base64Data.match(/^data:(image\/(jpeg|jpg|png|gif|webp));base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const ext = contentType.includes("png") ? "png" : "jpg";
  const bytes = Uint8Array.from(atob(match[3]), (c) => c.charCodeAt(0));
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `${agentId}/property-${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage
    .from("agent-images")
    .upload(fileName, bytes, { contentType, upsert: true });
  if (error) {
    console.error("Image upload error");
    return null;
  }
  const { data } = supabase.storage.from("agent-images").getPublicUrl(fileName);
  return data.publicUrl;
}

async function uploadAdditionalPhotos(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  base64Array: string[],
): Promise<string[]> {
  const results: string[] = [];
  for (const b64 of base64Array) {
    const url = await uploadPropertyImage(supabase, agentId, b64);
    if (url) results.push(url);
  }
  return results;
}

function storagePathFromUrl(url: string): string | null {
  const marker = "/object/public/agent-images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteOrphanedImages(
  supabase: ReturnType<typeof createClient>,
  urls: (string | null | undefined)[],
): Promise<void> {
  const paths = urls
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map(storagePathFromUrl)
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return;
  await supabase.storage.from("agent-images").remove(paths);
}

Deno.serve(async (req: Request) => {
  const log = createLogger('manage-properties', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();
    const { token, action, property, ids } = body ?? {};

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token." }), { status: 400, headers: cors });
    }
    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action." }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: linkRow, error: linkErr } = await supabase
      .from("magic_links")
      .select("agent_id, expires_at, used_at")
      .eq("token", token)
      .is("revoked_at", null)
      .single();

    if (linkErr || !linkRow) {
      return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: cors });
    }
    if (new Date(linkRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401, headers: cors });
    }
    if (!linkRow.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), { status: 401, headers: cors });
    }

    const agentId: string = linkRow.agent_id;

    // ── LIST ──
    if (action === "list") {
      const { data: agent } = await supabase
        .from("agents")
        .select("tier, stripe_subscription_status, stripe_current_period_end")
        .eq("id", agentId)
        .single();

      const effectiveTier = agent ? resolveEffectiveTier(agent) : "free";
      const limit = tierLimit(effectiveTier);

      const { data: properties, error: propsErr } = await supabase
        .from("properties")
        .select(PROP_SELECT)
        .eq("agent_id", agentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (propsErr) {
        console.error("list error");
        log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to fetch properties' });
        return new Response(JSON.stringify({ error: "Failed to fetch properties." }), { status: 500, headers: cors });
      }

      log({ event: 'success', agent_id: agentId, status: 200 });
      return new Response(
        JSON.stringify({
          properties: properties ?? [],
          count: (properties ?? []).length,
          limit,
          tier: effectiveTier,
        }),
        { status: 200, headers: cors },
      );
    }

    // ── ADD ──
    if (action === "add") {
      if (!property) {
        return new Response(JSON.stringify({ error: "Missing property data." }), { status: 400, headers: cors });
      }

      const { data: agent } = await supabase
        .from("agents")
        .select("tier, stripe_subscription_status, stripe_current_period_end")
        .eq("id", agentId)
        .single();

      const effectiveTier = agent ? resolveEffectiveTier(agent) : "free";
      const limit = tierLimit(effectiveTier);

      if (limit !== null) {
        const { count } = await supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId);
        if ((count ?? 0) >= limit) {
          return new Response(
            JSON.stringify({ error: `Listing limit reached (${limit}). Upgrade to add more.`, limit_reached: true }),
            { status: 403, headers: cors },
          );
        }
      }

      // Upload cover image if provided
      let imageUrl: string | null = null;
      if (property.image_base64) {
        imageUrl = await uploadPropertyImage(supabase, agentId, property.image_base64);
      }

      // Upload additional photos
      const additionalUrls: string[] = [];
      if (Array.isArray(property.additional_photos) && property.additional_photos.length > 0) {
        const uploaded = await uploadAdditionalPhotos(supabase, agentId, property.additional_photos);
        additionalUrls.push(...uploaded);
      }

      // Get max sort_order
      const { data: maxRow } = await supabase
        .from("properties")
        .select("sort_order")
        .eq("agent_id", agentId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
      const nextOrder = maxRow ? (maxRow.sort_order ?? 0) + 1 : 0;

      const dldPermit = property.dld_permit || null;
      const insert: Record<string, unknown> = {
        agent_id: agentId,
        title: property.title,
        price: property.price || null,
        location: property.location || null,
        bedrooms: property.bedrooms != null ? Number(property.bedrooms) : null,
        area_sqft: property.area_sqft != null ? Number(property.area_sqft) : null,
        property_type: property.property_type || null,
        status: property.status || "available",
        dld_permit: dldPermit,
        is_active: !!dldPermit,
        external_url: property.external_url || null,
        sort_order: nextOrder,
        additional_photos: additionalUrls,
      };
      if (imageUrl) insert.image_url = imageUrl;

      const { data: newProp, error: insertErr } = await supabase
        .from("properties")
        .insert(insert)
        .select(PROP_SELECT)
        .single();

      if (insertErr) {
        console.error("add error");
        log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to add property' });
        return new Response(JSON.stringify({ error: "Failed to add property." }), { status: 500, headers: cors });
      }

      // Post-insert race check: verify limit wasn't exceeded by concurrent requests
      if (limit !== null) {
        const { count: postCount } = await supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId);
        if ((postCount ?? 0) > limit) {
          await supabase.from("properties").delete().eq("id", newProp!.id).eq("agent_id", agentId);
          log({ event: 'error', agent_id: agentId, status: 403, error: 'Listing limit reached' });
          return new Response(
            JSON.stringify({ error: `Listing limit reached (${limit}). Upgrade to add more.`, limit_reached: true }),
            { status: 403, headers: cors },
          );
        }
      }

      log({ event: 'success', agent_id: agentId, status: 200 });
      return new Response(JSON.stringify({ property: newProp }), { status: 200, headers: cors });
    }

    // ── UPDATE ──
    if (action === "update") {
      if (!property || !property.id) {
        return new Response(JSON.stringify({ error: "Missing property id." }), { status: 400, headers: cors });
      }

      // Verify ownership and fetch current image URLs
      const { data: existing, error: fetchErr } = await supabase
        .from("properties")
        .select("id, agent_id, image_url, additional_photos")
        .eq("id", property.id)
        .single();

      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: "Property not found." }), { status: 404, headers: cors });
      }
      if (existing.agent_id !== agentId) {
        return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
      }

      // Handle cover image: new upload OR keep existing URL OR clear
      let imageUrl: string | null | undefined;
      if (property.image_base64) {
        const uploaded = await uploadPropertyImage(supabase, agentId, property.image_base64);
        if (uploaded) {
          imageUrl = uploaded;
          // Delete old cover if replaced
          if (existing.image_url) await deleteOrphanedImages(supabase, [existing.image_url]);
        }
      } else if ("keep_cover_url" in property) {
        imageUrl = property.keep_cover_url || null;
        // Delete old cover if cleared
        if (!property.keep_cover_url && existing.image_url) {
          await deleteOrphanedImages(supabase, [existing.image_url]);
        }
      }

      // Handle additional photos
      let newAdditionalUrls: string[] | undefined;
      if (Array.isArray(property.additional_photos) || Array.isArray(property.retained_additional_photos)) {
        const retained: string[] = Array.isArray(property.retained_additional_photos)
          ? property.retained_additional_photos
          : [];
        const newUploaded =
          Array.isArray(property.additional_photos) && property.additional_photos.length > 0
            ? await uploadAdditionalPhotos(supabase, agentId, property.additional_photos)
            : [];
        newAdditionalUrls = [...retained, ...newUploaded];

        // Delete orphaned additional photos
        const existingAdditional: string[] = Array.isArray(existing.additional_photos)
          ? existing.additional_photos
          : [];
        const orphaned = existingAdditional.filter((u: string) => !retained.includes(u));
        if (orphaned.length > 0) await deleteOrphanedImages(supabase, orphaned);
      }

      // Build updates from defined fields only
      const updates: Record<string, unknown> = {};
      if (property.title !== undefined) updates.title = property.title;
      if (property.price !== undefined) updates.price = property.price || null;
      if (property.location !== undefined) updates.location = property.location || null;
      if (property.bedrooms !== undefined) updates.bedrooms = property.bedrooms != null ? Number(property.bedrooms) : null;
      if (property.area_sqft !== undefined) updates.area_sqft = property.area_sqft != null ? Number(property.area_sqft) : null;
      if (property.property_type !== undefined) updates.property_type = property.property_type || null;
      if (property.status !== undefined) updates.status = property.status;
      if (property.dld_permit !== undefined) {
        updates.dld_permit = property.dld_permit || null;
        updates.is_active = !!property.dld_permit;
      }
      if (property.external_url !== undefined) updates.external_url = property.external_url || null;
      if (imageUrl !== undefined) updates.image_url = imageUrl;
      if (newAdditionalUrls !== undefined) updates.additional_photos = newAdditionalUrls;

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "No fields to update." }), { status: 400, headers: cors });
      }

      const { data: updated, error: updateErr } = await supabase
        .from("properties")
        .update(updates)
        .eq("id", property.id)
        .eq("agent_id", agentId)
        .select(PROP_SELECT)
        .single();

      if (updateErr) {
        console.error("update error");
        log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to update property' });
        return new Response(JSON.stringify({ error: "Failed to update property." }), { status: 500, headers: cors });
      }

      log({ event: 'success', agent_id: agentId, status: 200 });
      return new Response(JSON.stringify({ property: updated }), { status: 200, headers: cors });
    }

    // ── DELETE ──
    if (action === "delete") {
      if (!property || !property.id) {
        return new Response(JSON.stringify({ error: "Missing property id." }), { status: 400, headers: cors });
      }

      // Fetch image URLs before deleting
      const { data: toDelete } = await supabase
        .from("properties")
        .select("id, agent_id, image_url, additional_photos")
        .eq("id", property.id)
        .eq("agent_id", agentId)
        .single();

      const { data: deleted, error: deleteErr } = await supabase
        .from("properties")
        .delete()
        .eq("id", property.id)
        .eq("agent_id", agentId)
        .select("id");

      if (deleteErr) {
        console.error("delete error");
        log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to delete property' });
        return new Response(JSON.stringify({ error: "Failed to delete property." }), { status: 500, headers: cors });
      }
      if (!deleted || deleted.length === 0) {
        log({ event: 'bad_request', agent_id: agentId, status: 404 });
        return new Response(JSON.stringify({ error: "Property not found." }), { status: 404, headers: cors });
      }

      // Clean up storage after successful delete
      if (toDelete) {
        const toRemove: string[] = [];
        if (toDelete.image_url) toRemove.push(toDelete.image_url);
        if (Array.isArray(toDelete.additional_photos)) toRemove.push(...toDelete.additional_photos);
        if (toRemove.length > 0) await deleteOrphanedImages(supabase, toRemove);
      }

      log({ event: 'success', agent_id: agentId, status: 200 });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    // ── REORDER ──
    if (action === "reorder") {
      if (!Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ error: "Missing ids array." }), { status: 400, headers: cors });
      }

      // Verify ALL ids belong to agent in a single query
      const { data: owned, error: ownedErr } = await supabase
        .from("properties")
        .select("id")
        .eq("agent_id", agentId)
        .in("id", ids);

      if (ownedErr) {
        return new Response(JSON.stringify({ error: "Failed to verify ownership." }), { status: 500, headers: cors });
      }

      const ownedSet = new Set((owned ?? []).map((r: { id: string }) => r.id));
      if (ids.some((id: string) => !ownedSet.has(id))) {
        return new Response(JSON.stringify({ error: "Forbidden: one or more properties not owned by agent." }), { status: 403, headers: cors });
      }

      const reorderResults = await Promise.all(
        ids.map((id: string, index: number) =>
          supabase
            .from("properties")
            .update({ sort_order: index })
            .eq("id", id)
            .eq("agent_id", agentId)
        ),
      );

      const reorderFailed = reorderResults.filter((r) => r.error);
      if (reorderFailed.length > 0) {
        console.error("Reorder partial failure");
        log({ event: 'error', agent_id: agentId, status: 500, error: 'Reorder partially failed' });
        return new Response(JSON.stringify({ error: "Reorder partially failed." }), { status: 500, headers: cors });
      }

      log({ event: 'success', agent_id: agentId, status: 200 });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    log({ event: 'bad_request', agent_id: agentId, status: 400 });
    return new Response(JSON.stringify({ error: "Unknown action." }), { status: 400, headers: cors });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("manage-properties error");
    return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: cors });
  } finally {
    log.flush(Date.now() - _start);
  }
});
