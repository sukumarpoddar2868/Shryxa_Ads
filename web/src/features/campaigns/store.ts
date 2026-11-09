import "server-only";
import { db } from "@/lib/supabase/server";
import type { CampaignRow } from "@/lib/supabase/types";
import { MEDIA_BUCKET } from "./media/rules";

/**
 * Campaign rows (0004): drafts + launched campaigns, text only.
 * Media lives in Storage; drafts keep only file paths (blob preview URLs are
 * stripped on save and re-signed on load).
 */

const MAX_DRAFT_BYTES = 150_000;

type Json = unknown;
type MediaLike = { path: string; previewUrl: string };
const isMedia = (v: unknown): v is MediaLike =>
  !!v && typeof v === "object" && typeof (v as MediaLike).path === "string" && "previewUrl" in (v as object);

/** Deep-copy JSON, calling `fn` on every media-like object (has path + previewUrl). */
function mapMedia(v: Json, fn: (m: MediaLike) => void): Json {
  const copy = JSON.parse(JSON.stringify(v ?? null)) as Json;
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      if (isMedia(x)) fn(x);
      Object.values(x).forEach(walk);
    }
  };
  walk(copy);
  return copy;
}

/** All storage paths referenced by a draft (images, videos, covers). */
export function mediaPaths(draft: Json): string[] {
  const out: string[] = [];
  mapMedia(draft, (m) => out.push(m.path));
  return [...new Set(out)];
}

type DraftShape = {
  clientId?: unknown;
  objective?: unknown;
  campaign?: { name?: unknown; currency?: unknown; budgetType?: unknown; amount?: unknown };
  audience?: { locations?: unknown[]; type?: unknown };
  ad?: { destination?: unknown; format?: unknown; headline?: unknown; cta?: unknown; carousel?: { cards?: { headline?: unknown }[] } };
};

/** Small text summary shown in the campaigns list. */
function summaryOf(d: DraftShape) {
  return {
    format: typeof d.ad?.format === "string" ? d.ad.format : "single",
    areas: Array.isArray(d.audience?.locations) ? d.audience.locations.length : 0,
    audience: typeof d.audience?.type === "string" ? d.audience.type : "core",
    headline: String((d.ad?.format === "carousel" ? d.ad?.carousel?.cards?.[0]?.headline : d.ad?.headline) ?? "").slice(0, 80),
    cta: typeof d.ad?.cta === "string" ? d.ad.cta : null,
  };
}

function columnsOf(d: DraftShape) {
  const amount = Number(d.campaign?.amount);
  return {
    name: String(d.campaign?.name ?? "").slice(0, 200),
    objective: typeof d.objective === "string" ? d.objective : null,
    destination: typeof d.ad?.destination === "string" ? d.ad.destination : null,
    currency: typeof d.campaign?.currency === "string" ? d.campaign.currency : null,
    budget_type: d.campaign?.budgetType === "lifetime" ? ("lifetime" as const) : ("daily" as const),
    budget_minor: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    summary: summaryOf(d),
  };
}

async function ownsClient(userId: number, clientId: number) {
  const { data } = await db().from("clients").select("id").eq("id", clientId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

/** Create or update a draft. Returns the row id, or an error message. */
export async function saveDraft(userId: number, id: number | null, draft: Json): Promise<{ id: number } | { error: string }> {
  const d = (draft ?? {}) as DraftShape;
  const clientId = Number(d.clientId);
  if (!Number.isSafeInteger(clientId) || !(await ownsClient(userId, clientId))) return { error: "Choose a client first." };
  // Strip local blob previews and launch state before storing.
  const clean = mapMedia(draft, (m) => {
    m.previewUrl = "";
  }) as Record<string, unknown>;
  delete clean.launched;
  if (JSON.stringify(clean).length > MAX_DRAFT_BYTES) return { error: "Draft is too large to save." };
  const row = { ...columnsOf(d), client_id: clientId, draft: clean, updated_at: new Date().toISOString() };

  if (id) {
    const { data, error } = await db().from("campaigns").update(row).eq("id", id).eq("user_id", userId).eq("state", "draft").select("id").maybeSingle();
    if (error) return { error: "Couldn't save the draft." };
    if (data) return { id: data.id };
    // Row gone (deleted or launched) → fall through and create a new draft.
  }
  const { data, error } = await db().from("campaigns").insert({ ...row, user_id: userId, state: "draft" }).select("id").single();
  if (error || !data) return { error: "Couldn't save the draft." };
  return { id: data.id };
}

/** Load one of the user's drafts, with fresh 1-hour preview links for its media. */
export async function loadDraft(userId: number, id: number): Promise<{ id: number; draft: Json } | null> {
  if (!Number.isSafeInteger(id)) return null;
  const { data } = await db().from("campaigns").select("id, draft, state").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data || data.state !== "draft" || !data.draft) return null;
  const paths = mediaPaths(data.draft).filter((p) => p.startsWith(`u${userId}/`));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await db().storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const draft = mapMedia(data.draft, (m) => {
    m.previewUrl = signed.get(m.path) ?? "";
  });
  return { id: data.id, draft };
}

export async function deleteDraft(userId: number, id: number): Promise<void> {
  const { data } = await db().from("campaigns").select("draft").eq("id", id).eq("user_id", userId).eq("state", "draft").maybeSingle();
  if (!data) return;
  await removeMedia(userId, mediaPaths(data.draft));
  await db().from("campaigns").delete().eq("id", id).eq("user_id", userId).eq("state", "draft");
}

/** After a live launch: store Meta ids (update the draft row, or insert one). */
export async function recordLaunch(
  userId: number,
  draftId: number | null,
  draft: Json,
  ids: { campaign?: string; ad_set?: string; ad?: string; lead_form?: string },
): Promise<void> {
  const d = (draft ?? {}) as DraftShape;
  const clientId = Number(d.clientId);
  if (!Number.isSafeInteger(clientId)) return;
  const row = {
    ...columnsOf(d),
    client_id: clientId,
    state: "launched" as const,
    meta_campaign_id: ids.campaign ?? null,
    meta_adset_id: ids.ad_set ?? null,
    meta_ad_id: ids.ad ?? null,
    meta_form_id: ids.lead_form ?? null,
    draft: null,
    launched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (draftId) {
    const { data } = await db().from("campaigns").update(row).eq("id", draftId).eq("user_id", userId).select("id").maybeSingle();
    if (data) return;
  }
  await db().from("campaigns").insert({ ...row, user_id: userId });
}

/** Delete the user's own media files (best-effort). */
export async function removeMedia(userId: number, paths: string[]): Promise<void> {
  const own = paths.filter((p) => p.startsWith(`u${userId}/`) && !p.includes(".."));
  if (own.length) await db().storage.from(MEDIA_BUCKET).remove(own);
}

export async function listCampaignRows(userId: number): Promise<CampaignRow[]> {
  const { data } = await db()
    .from("campaigns")
    .select("id, user_id, client_id, state, name, objective, destination, currency, budget_type, budget_minor, meta_campaign_id, meta_adset_id, meta_ad_id, meta_form_id, summary, created_at, updated_at, launched_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((r) => ({ ...r, draft: null })) as CampaignRow[];
}
