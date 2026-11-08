"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { actId } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { metaEnv } from "@/lib/env";
import { MetaApiError, graphList, graphPost } from "@/lib/meta/graph";
import type { ClientRow } from "@/lib/supabase/types";

/**
 * Custom & lookalike audiences in the client's ad account (Meta Marketing API):
 *   list · customer list (hashed in the browser) · website visitors (Pixel) ·
 *   Facebook Page / Instagram engagers · lookalike.
 */

export type AudienceKind = "customer_list" | "website" | "engagement" | "lookalike" | "other";
export type AudienceItem = { id: string; name: string; kind: AudienceKind; size: string | null; status: string | null; usable: boolean };
type Ctx = { token: string; client: ClientRow; account: string };
type Fail = { ok: false; error: string; termsUrl?: string };

async function context(clientId: number): Promise<Ctx | Fail> {
  const user = await requireUser();
  const client = await getClient(user.id, clientId);
  if (!client) return { ok: false, error: "Client not found." };
  if (!client.ad_account_id) return { ok: false, error: "Pick this client's ad account first." };
  const token = client.meta_connection_id ? await getConnectionToken(user.id, client.meta_connection_id) : null;
  if (!token) return { ok: false, error: "This client's Facebook connection is missing or expired. Reconnect it on the client page." };
  return { token, client, account: actId(client.ad_account_id) };
}

const termsUrl = (account: string) => `https://business.facebook.com/ads/manage/customaudiences/tos/?act=${account.replace(/^act_/, "")}`;

function fail(e: unknown, account: string): Fail {
  const msg = e instanceof MetaApiError ? e.userMessage || e.message : e instanceof Error ? e.message : "Unknown error";
  // Custom Audience terms not accepted yet for this ad account.
  if (/terms|tos/i.test(msg)) return { ok: false, error: "Accept Meta's Custom Audience terms for this ad account first, then try again.", termsUrl: termsUrl(account) };
  return { ok: false, error: msg };
}

const KIND: Record<string, AudienceKind> = { CUSTOM: "customer_list", WEBSITE: "website", ENGAGEMENT: "engagement", LOOKALIKE: "lookalike" };

function sizeLabel(lo?: number, hi?: number): string | null {
  if (lo == null || lo < 0) return null;
  const f = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  return hi && hi > lo ? `${f(lo)}–${f(hi)}` : `~${f(lo)}`;
}

export async function listAudiencesAction(clientId: number): Promise<{ ok: true; audiences: AudienceItem[] } | Fail> {
  const c = await context(clientId);
  if ("error" in c) return c;
  try {
    const rows = await graphList<{
      id: string;
      name?: string;
      subtype?: string;
      approximate_count_lower_bound?: number;
      approximate_count_upper_bound?: number;
      delivery_status?: { code?: number; description?: string };
      operation_status?: { code?: number; description?: string };
    }>(`${c.account}/customaudiences`, c.token, {
      fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status",
    }, 5);
    return {
      ok: true,
      audiences: rows.map((r) => ({
        id: r.id,
        name: r.name || `Audience ${r.id}`,
        kind: KIND[r.subtype ?? ""] ?? "other",
        size: sizeLabel(r.approximate_count_lower_bound, r.approximate_count_upper_bound),
        status: r.delivery_status?.description ?? r.operation_status?.description ?? null,
        // 200 = ready; 300/400 = too small / populating etc. Let Meta decide at launch, but flag obvious blockers.
        usable: (r.operation_status?.code ?? 200) !== 471,
      })),
    };
  } catch (e) {
    return fail(e, c.account);
  }
}

const Name = z.string().trim().min(2, "Give the audience a name.").max(80);

/** Customer list: rows were normalised + SHA-256 hashed in the browser. */
export async function createCustomerListAction(
  clientId: number,
  name: string,
  rows: [string, string][],
): Promise<{ ok: true; audience: AudienceItem; uploaded: number } | Fail> {
  const n = Name.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const hex = /^([a-f0-9]{64})?$/;
  const clean = (Array.isArray(rows) ? rows : []).filter((r) => Array.isArray(r) && r.length === 2 && hex.test(r[0]) && hex.test(r[1]) && (r[0] || r[1]));
  if (clean.length < 1) return { ok: false, error: "No valid phone numbers or emails found." };
  if (clean.length > 50_000) return { ok: false, error: "Upload at most 50,000 customers at a time." };
  const c = await context(clientId);
  if ("error" in c) return c;
  try {
    const created = await graphPost<{ id?: string }>(`${c.account}/customaudiences`, c.token, {
      name: n.data,
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      description: "Customer list uploaded from Shryxa Ads (hashed)",
    });
    if (!created.id) return { ok: false, error: "Meta didn't return an audience id." };
    for (let i = 0; i < clean.length; i += 10_000) {
      await graphPost(`${created.id}/users`, c.token, {
        payload: JSON.stringify({ schema: ["EMAIL", "PHONE"], data: clean.slice(i, i + 10_000) }),
      });
    }
    return { ok: true, uploaded: clean.length, audience: { id: created.id, name: n.data, kind: "customer_list", size: null, status: "Matching people — ready in a few hours", usable: true } };
  } catch (e) {
    return fail(e, c.account);
  }
}

const RuleInput = z.object({
  name: Name,
  source: z.enum(["website", "facebook_page", "instagram"]),
  days: z.number().int().min(1).max(730),
  urlContains: z.string().trim().max(200).optional(),
});

/** Website visitors (Pixel), Facebook Page engagers or Instagram engagers. */
export async function createRuleAudienceAction(clientId: number, input: z.input<typeof RuleInput>): Promise<{ ok: true; audience: AudienceItem } | Fail> {
  const p = RuleInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const c = await context(clientId);
  if ("error" in c) return c;
  const d = p.data;
  let rule: object;
  if (d.source === "website") {
    if (!c.client.pixel_id) return { ok: false, error: "Connect a Meta Pixel for this client first." };
    rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: c.client.pixel_id, type: "pixel" }],
            retention_seconds: Math.min(d.days, 180) * 86400,
            filter: { operator: "and", filters: [{ field: "url", operator: "i_contains", value: d.urlContains ?? "" }] },
          },
        ],
      },
    };
  } else {
    const fb = d.source === "facebook_page";
    const sourceId = fb ? c.client.page_id : c.client.instagram_actor_id;
    if (!sourceId) return { ok: false, error: fb ? "Pick this client's Facebook Page first." : "Connect this client's Instagram account first." };
    rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: sourceId, type: fb ? "page" : "ig_business" }],
            retention_seconds: d.days * 86400,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: fb ? "page_engaged" : "ig_business_profile_all" }] },
          },
        ],
      },
    };
  }
  try {
    const created = await graphPost<{ id?: string }>(`${c.account}/customaudiences`, c.token, { name: d.name, rule: JSON.stringify(rule), prefill: true });
    if (!created.id) return { ok: false, error: "Meta didn't return an audience id." };
    return { ok: true, audience: { id: created.id, name: d.name, kind: d.source === "website" ? "website" : "engagement", size: null, status: "Filling — ready shortly", usable: true } };
  } catch (e) {
    return fail(e, c.account);
  }
}

const LookalikeInput = z.object({
  name: Name,
  sourceId: z.string().regex(/^\d+$/),
  country: z.string().regex(/^[A-Z]{2}$/),
  percent: z.number().int().min(1).max(10),
});

/** Lookalike: people similar to a source audience (≥100 people) in one country. */
export async function createLookalikeAction(clientId: number, input: z.input<typeof LookalikeInput>): Promise<{ ok: true; audience: AudienceItem } | Fail> {
  const p = LookalikeInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Pick a source audience and size." };
  const c = await context(clientId);
  if ("error" in c) return c;
  const d = p.data;
  // lookalike_spec.country was removed in Graph v27; older versions require it.
  const major = Number(metaEnv().META_API_VERSION.replace(/^v(\d+).*/, "$1"));
  const spec = major >= 27 ? { ratio: d.percent / 100 } : { ratio: d.percent / 100, country: d.country };
  try {
    const created = await graphPost<{ id?: string }>(`${c.account}/customaudiences`, c.token, {
      name: d.name,
      subtype: "LOOKALIKE",
      origin_audience_id: d.sourceId,
      lookalike_spec: JSON.stringify(spec),
    });
    if (!created.id) return { ok: false, error: "Meta didn't return an audience id." };
    return { ok: true, audience: { id: created.id, name: d.name, kind: "lookalike", size: null, status: "Building — ready in 1–6 hours", usable: true } };
  } catch (e) {
    const f = fail(e, c.account);
    if (/100|too small|size/i.test(f.error)) return { ...f, error: `${f.error} — the source audience needs at least 100 people.` };
    return f;
  }
}
