/**
 * Spec → ordered Meta create-operations. Port of `payload_pipeline/builders.py`.
 *
 * Call order is strict:
 *   1. Campaign  POST act_{acct}/campaigns                  → id
 *   2. Ad set    POST act_{acct}/adsets   (uses campaign id) → id
 *   3. Ad        POST act_{acct}/ads      (uses ad set id + inline creative)
 * Later steps reference earlier ids through placeholder strings that the
 * adapter substitutes once the real (or fake) id is known.
 */
import type { CampaignSpec } from "./schema.ts";

export const CAMPAIGN_REF = "${CAMPAIGN_ID}";
export const AD_SET_REF = "${AD_SET_ID}";
export const AD_REF = "${AD_ID}";
/** Swapped for the Instant Form id once the form exists. */
export const LEAD_FORM_REF = "REPLACE_AFTER_LEAD_FORM_CREATED";

export type ResourceType = "campaign" | "ad_set" | "ad";
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export type Operation = {
  resourceType: ResourceType;
  refKey: ResourceType;
  endpoint: string;
  payload: JsonObject;
};

/** Drops null/undefined values (one level), like Python's `_strip_none`. */
function strip(o: Record<string, unknown>): JsonObject {
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v as Json;
  return out;
}
const orNull = <T>(a: T[] | null | undefined): T[] | null => (a && a.length ? a : null);

type LinkData = NonNullable<CampaignSpec["ad"]["creative"]["object_story_spec"]["link_data"]>;

/**
 * asset_feed_spec with per-placement image rules. Images are referenced by
 * `name` (Meta rejects hash references with error 100). Rules are evaluated
 * in order, first match wins → IG portrait before the generic feed rule.
 */
function buildAssetFeedSpec(ld: LinkData, ctaValue: Record<string, string>): JsonObject {
  // Single-image ads always have image_hash (schema-enforced).
  const images: JsonObject[] = [{ hash: ld.image_hash ?? null, name: "feed" }];
  const rules: JsonObject[] = [];

  if (ld.image_hash_story) {
    images.push({ hash: ld.image_hash_story, name: "story" });
    rules.push({
      customization_spec: {
        publisher_platforms: ["facebook", "instagram"],
        facebook_positions: ["story"],
        instagram_positions: ["story", "reels"],
      },
      image_label: { name: "story" },
    });
  }
  if (ld.image_hash_portrait) {
    images.push({ hash: ld.image_hash_portrait, name: "portrait" });
    rules.push({
      customization_spec: { publisher_platforms: ["instagram"], instagram_positions: ["stream"] },
      image_label: { name: "portrait" },
    });
  }
  rules.push({
    customization_spec: {
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed"],
      instagram_positions: ["stream"],
    },
    image_label: { name: "feed" },
  });

  const spec: JsonObject = {
    images,
    bodies: [{ text: ld.message }],
    titles: [{ text: ld.name }],
    link_urls: [{ website_url: ld.link }],
    ad_formats: ["SINGLE_IMAGE"],
    call_to_action_types: [ld.call_to_action.type],
    asset_customization_rules: rules,
  };
  if (ld.description) spec.descriptions = [{ text: ld.description }];
  if (ctaValue.lead_gen_form_id) spec.additional_data = { lead_gen_form_id: ctaValue.lead_gen_form_id };
  return spec;
}

/**
 * CTA `value` by destination:
 *   instant form → {lead_gen_form_id} · messaging → {app_destination} ·
 *   website / call (tel:) → {link}.
 */
function ctaValueFor(
  cta: { value_lead_gen_form_id?: string | null; value_app_destination?: string | null; value_link?: string | null },
  fallbackLink: string,
): Record<string, string> {
  if (cta.value_lead_gen_form_id) return { lead_gen_form_id: cta.value_lead_gen_form_id };
  if (cta.value_app_destination) return { app_destination: cta.value_app_destination };
  return { link: cta.value_link || fallbackLink };
}

export function buildCampaign(spec: CampaignSpec): Operation {
  const c = spec.campaign;
  const payload: JsonObject = {
    name: c.name,
    objective: c.objective,
    status: c.status,
    special_ad_categories: c.special_ad_categories,
    buying_type: c.buying_type,
    // Required by newer API versions when CBO is off (budget lives on the ad set).
    is_adset_budget_sharing_enabled: false,
  };
  if (c.special_ad_category_country) payload.special_ad_category_country = c.special_ad_category_country;
  if (c.spend_cap != null) payload.spend_cap = c.spend_cap;
  if (c.daily_budget != null) payload.daily_budget = c.daily_budget;
  if (c.lifetime_budget != null) payload.lifetime_budget = c.lifetime_budget;
  return { resourceType: "campaign", refKey: "campaign", endpoint: `act_${spec.ad_account_id}/campaigns`, payload };
}

export function buildAdSet(spec: CampaignSpec): Operation {
  const s = spec.ad_set;
  const t = s.targeting;
  const g = t.geo_locations;

  const geo = strip({
    countries: orNull(g.countries),
    cities: orNull(g.cities),
    regions: orNull(g.regions),
    custom_locations: orNull(g.custom_locations),
    location_types: g.location_types,
  });

  const flexibleSpec = orNull(
    t.flexible_spec.map((b) =>
      strip({
        interests: orNull(b.interests.map((i) => strip(i))),
        behaviors: orNull(b.behaviors.map((i) => strip(i))),
      }),
    ),
  );

  const targeting = strip({
    geo_locations: geo,
    age_min: t.age_min,
    age_max: t.age_max,
    genders: orNull(t.genders),
    locales: orNull(t.locales),
    flexible_spec: flexibleSpec,
    publisher_platforms: t.publisher_platforms,
    facebook_positions: t.facebook_positions,
    instagram_positions: t.instagram_positions,
    user_os: t.user_os,
    device_platforms: t.device_platforms,
    targeting_automation: t.targeting_automation,
  });

  const payload: JsonObject = {
    name: s.name,
    campaign_id: CAMPAIGN_REF,
    // The whole tree comes up with the campaign's launch status.
    status: spec.campaign.status,
    optimization_goal: s.optimization_goal,
    billing_event: s.billing_event,
    bid_strategy: s.bid_strategy,
    destination_type: s.destination_type,
    targeting,
  };
  if (s.bid_amount != null) payload.bid_amount = s.bid_amount;
  if (s.daily_budget != null) payload.daily_budget = s.daily_budget;
  if (s.lifetime_budget != null) payload.lifetime_budget = s.lifetime_budget;
  if (s.start_time) payload.start_time = s.start_time;
  if (s.end_time) payload.end_time = s.end_time;
  if (s.promoted_object) payload.promoted_object = strip(s.promoted_object);
  // Awareness has no conversion location.
  if (spec.campaign.objective === "OUTCOME_AWARENESS") delete payload.destination_type;
  if (s.frequency_control_specs?.length) payload.frequency_control_specs = s.frequency_control_specs;
  if (s.dsa_payor) payload.dsa_payor = s.dsa_payor;
  if (s.dsa_beneficiary) payload.dsa_beneficiary = s.dsa_beneficiary;

  return { resourceType: "ad_set", refKey: "ad_set", endpoint: `act_${spec.ad_account_id}/adsets`, payload };
}

export function buildAd(spec: CampaignSpec): Operation {
  const a = spec.ad;
  const oss = a.creative.object_story_spec;

  if (oss.video_data) {
    const v = oss.video_data;
    const value = ctaValueFor(v.call_to_action, v.link);
    const objectStorySpec = strip({
      page_id: oss.page_id,
      // Meta renamed instagram_actor_id → instagram_user_id (Graph v22+).
      instagram_user_id: oss.instagram_actor_id,
      video_data: strip({
        video_id: v.video_id,
        image_hash: v.image_hash,
        image_url: v.image_url,
        message: v.message,
        title: v.title,
        link_description: v.link_description,
        call_to_action: { type: v.call_to_action.type, value },
        page_welcome_message: v.page_welcome_message,
      }),
    });
    return {
      resourceType: "ad",
      refKey: "ad",
      endpoint: `act_${spec.ad_account_id}/ads`,
      payload: {
        name: a.name,
        adset_id: AD_SET_REF,
        status: spec.campaign.status,
        creative: strip({ name: a.creative.name, object_story_spec: objectStorySpec, url_tags: a.creative.url_tags }),
      },
    };
  }

  const ld = oss.link_data!;

  // CTA value: website → {link}, lead form → {lead_gen_form_id}.
  const ctaValue = ctaValueFor(ld.call_to_action, ld.link);

  const cta = { type: ld.call_to_action.type, value: ctaValue };
  const cards = ld.child_attachments?.length ? ld.child_attachments : null;
  // Placement image variants only apply to single-image ads.
  const hasExtras = !cards && Boolean(ld.image_hash_story || ld.image_hash_portrait);

  const objectStorySpec = strip({
    page_id: oss.page_id,
    instagram_user_id: oss.instagram_actor_id,
    // With asset_feed_spec, link_data is omitted (images/text live there).
    link_data: hasExtras
      ? null
      : strip({
          image_hash: cards ? null : ld.image_hash,
          message: ld.message,
          name: ld.name,
          description: ld.description,
          link: ld.link,
          call_to_action: cta,
          child_attachments: cards
            ? cards.map((c) =>
                strip({ image_hash: c.image_hash, name: c.name, description: c.description, link: c.link || ld.link, call_to_action: cta }),
              )
            : null,
          multi_share_optimized: cards ? (ld.multi_share_optimized ?? true) : null,
          multi_share_end_card: cards ? (ld.multi_share_end_card ?? false) : null,
          page_welcome_message: ld.page_welcome_message,
        }),
  });

  const creative = strip({ name: a.creative.name, object_story_spec: objectStorySpec, url_tags: a.creative.url_tags });
  if (hasExtras) creative.asset_feed_spec = buildAssetFeedSpec(ld, ctaValue);

  return {
    resourceType: "ad",
    refKey: "ad",
    endpoint: `act_${spec.ad_account_id}/ads`,
    payload: { name: a.name, adset_id: AD_SET_REF, status: spec.campaign.status, creative },
  };
}

export function buildAll(spec: CampaignSpec): Operation[] {
  return [buildCampaign(spec), buildAdSet(spec), buildAd(spec)];
}

export const PLACEHOLDERS: Record<ResourceType, string> = {
  campaign: CAMPAIGN_REF,
  ad_set: AD_SET_REF,
  ad: AD_REF,
};

/** Replace any string value that exactly equals a known placeholder. */
export function substitute<T extends Json>(obj: T, refs: Record<string, string>): T {
  if (typeof obj === "string") return (refs[obj] ?? obj) as T;
  if (Array.isArray(obj)) return obj.map((v) => substitute(v, refs)) as T;
  if (obj && typeof obj === "object") {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(obj)) out[k] = substitute(v, refs);
    return out as T;
  }
  return obj;
}
