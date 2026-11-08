"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { actId } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphGet } from "@/lib/meta/graph";
import { buildAll } from "../engine/builders.ts";
import { CURRENCIES, DESTINATIONS } from "../engine/presets.ts";
import { renderSpec } from "../engine/render.ts";
import { validateSpec } from "../engine/schema.ts";

/**
 * Estimated audience size from Meta (`act_<id>/delivery_estimate`) for the
 * exact targeting the ad set would use. Free — uses the client's connection.
 */

const Input = z.object({
  clientId: z.number().int().positive(),
  objective: z.enum(["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"]),
  destination: z.enum(DESTINATIONS),
  currency: z.enum(CURRENCIES),
  pins: z.array(z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().min(1).max(80) })).max(30),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  gender: z.enum(["any", "female", "male"]),
  language: z.string().max(40),
  device: z.enum(["all", "android", "ios"]),
  advantage: z.boolean(),
  include: z.array(z.string().regex(/^\d+$/)).max(20),
  exclude: z.array(z.string().regex(/^\d+$/)).max(20),
  manualPlacements: z.boolean(),
  facebook: z.boolean(),
  instagram: z.boolean(),
});
export type EstimateInput = z.input<typeof Input>;

export type EstimateResult =
  | { ok: true; lower: number; upper: number; ready: boolean }
  | { ok: false; error: string };

export async function estimateAudienceAction(raw: EstimateInput): Promise<EstimateResult> {
  const user = await requireUser();
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Targeting is incomplete." };
  const p = parsed.data;
  if (!p.pins.length) return { ok: false, error: "Add at least one area to see the audience size." };

  const client = await getClient(user.id, p.clientId);
  if (!client?.ad_account_id || !client.page_id) return { ok: false, error: "Pick this client's ad account and Page first." };
  const token = client.meta_connection_id ? await getConnectionToken(user.id, client.meta_connection_id) : null;
  if (!token) return { ok: false, error: "Connect Facebook for this client to see the audience size." };

  // Website conversions without a Pixel can't be estimated as conversions — estimate reach for the same people instead.
  const conversions = p.destination === "website" && (p.objective === "OUTCOME_SALES" || p.objective === "OUTCOME_LEADS");
  const usePixel = conversions && client.pixel_id ? { pixelId: client.pixel_id, event: p.objective === "OUTCOME_SALES" ? "PURCHASE" : "LEAD" } : null;
  let ops;
  try {
    ops = buildAll(
      validateSpec(
        renderSpec({
          client: { business_name: "estimate", ad_account_id: client.ad_account_id, page_id: client.page_id, instagram_actor_id: client.instagram_actor_id },
          currency: p.currency,
          adCopy: { primary_text: "estimate", headline: "estimate", age_min: p.ageMin, age_max: p.ageMax, gender: p.gender, interest_targeting: [] },
          epicenters: p.pins.map((x) => ({ lat: x.lat, lng: x.lng, radius_km: x.radiusKm })),
          dailyBudget: 500,
          destination: conversions && !usePixel ? "website" : p.destination,
          objective: conversions && !usePixel ? "OUTCOME_TRAFFIC" : p.objective,
          imageHash: "estimate",
          landingPageUrl: "https://example.com",
          language: p.language,
          deviceOs: p.device,
          advantageAudience: p.advantage,
          instagramUsername: client.instagram_username,
          pixel: usePixel,
          audiences: p.include.length || p.exclude.length ? { include: p.include, exclude: p.exclude } : null,
          publisherPlatforms: p.manualPlacements
            ? ([p.facebook && "facebook", p.instagram && "instagram"].filter(Boolean) as ("facebook" | "instagram")[])
            : undefined,
          stamp: "estimate",
        }),
      ),
    );
  } catch {
    return { ok: false, error: "Targeting is incomplete." };
  }

  const adset = ops[1].payload as { targeting: unknown; optimization_goal: string; promoted_object?: unknown };
  try {
    const res = await graphGet<{ data?: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number; estimate_ready?: boolean }[] }>(
      `${actId(client.ad_account_id)}/delivery_estimate`,
      token,
      {
        targeting_spec: JSON.stringify(adset.targeting),
        optimization_goal: adset.optimization_goal,
        ...(adset.promoted_object ? { promoted_object: JSON.stringify(adset.promoted_object) } : {}),
      },
    );
    const d = res.data?.[0];
    if (!d || d.estimate_mau_lower_bound == null) return { ok: false, error: "Meta didn't return an estimate for this targeting." };
    return { ok: true, lower: d.estimate_mau_lower_bound, upper: d.estimate_mau_upper_bound ?? d.estimate_mau_lower_bound, ready: d.estimate_ready !== false };
  } catch (e) {
    const msg = e instanceof MetaApiError ? e.userMessage || e.message : "Couldn't reach Meta.";
    if (e instanceof MetaApiError && (e.code === 17 || e.code === 80004 || e.code === 613)) return { ok: false, error: "Meta is rate-limiting estimates — try again in a minute." };
    return { ok: false, error: `No estimate: ${msg}` };
  }
}
