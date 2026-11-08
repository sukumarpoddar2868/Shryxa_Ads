/**
 * Campaign spec — Zod port of `payload_pipeline/schemas.py`.
 *
 * Three tiers: campaign → ad_set → ad (+ optional lead_form). Field names stay
 * snake_case because they mirror the Meta Marketing API (and the Python spec).
 * Pure module: no server-only imports, so the parity test can run it in Node.
 */
import { z } from "zod";
import { normalizeIsoDateTime } from "./datetime.ts";

/* ---------- Level 1: Campaign ---------- */

export const OBJECTIVES = [
  "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES",
] as const;
export const SPECIAL_AD_CATEGORIES = [
  "NONE", "HOUSING", "EMPLOYMENT", "CREDIT",
  "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING",
  "FINANCIAL_PRODUCTS_SERVICES",
] as const;
export const LAUNCH_STATUSES = ["PAUSED", "ACTIVE"] as const;

const minor = z.number().int().nonnegative(); // minor currency units (paise / cents)

export const CampaignInput = z
  .object({
    name: z.string(),
    objective: z.enum(OBJECTIVES).default("OUTCOME_TRAFFIC"),
    // PAUSED is the safe default; ACTIVE starts spending immediately.
    // Applies to campaign, ad set and ad together.
    status: z.enum(LAUNCH_STATUSES).default("PAUSED"),
    special_ad_categories: z.array(z.enum(SPECIAL_AD_CATEGORIES)).default(() => ["NONE" as const]),
    special_ad_category_country: z.array(z.string()).nullish(),
    buying_type: z.enum(["AUCTION", "RESERVATION"]).default("AUCTION"),
    spend_cap: minor.nullish(), // hard ceiling
    // Only with Advantage+ Campaign Budget (CBO); v1 puts budget on the ad set.
    daily_budget: minor.nullish(),
    lifetime_budget: minor.nullish(),
  })
  .superRefine((c, ctx) => {
    const nonNone = c.special_ad_categories.filter((x) => x !== "NONE");
    if (nonNone.length && !c.special_ad_category_country?.length) {
      ctx.addIssue({
        code: "custom",
        message: "special_ad_category_country is required when special_ad_categories includes a non-NONE value",
      });
    }
    if (c.daily_budget && c.lifetime_budget) {
      ctx.addIssue({ code: "custom", message: "set only one of daily_budget or lifetime_budget at campaign level" });
    }
  });

/* ---------- Level 2: Ad Set ---------- */

export const OPTIMIZATION_GOALS = [
  "LINK_CLICKS", "IMPRESSIONS", "REACH", "LANDING_PAGE_VIEWS",
  "OFFSITE_CONVERSIONS", "VALUE", "THRUPLAY", "LEAD_GENERATION",
  "APP_INSTALLS",
] as const;
export const BILLING_EVENTS = ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY", "APP_INSTALLS"] as const;
export const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS",
] as const;
export const PLATFORMS = ["facebook", "instagram", "messenger", "audience_network"] as const;
export const DESTINATION_TYPES = [
  "WEBSITE", "APP", "MESSENGER", "INSTAGRAM_DIRECT",
  "WHATSAPP", "ON_AD", "ON_POST",
] as const;

/** A pin with a radius → targeting.geo_locations.custom_locations[]. */
export const CustomLocation = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().gt(0),
  distance_unit: z.enum(["kilometer", "mile"]).default("kilometer"),
});

export const GeoLocations = z.object({
  countries: z.array(z.string()).default(() => []), // ISO 3166-1 alpha-2
  cities: z.array(z.record(z.string(), z.unknown())).default(() => []),
  regions: z.array(z.record(z.string(), z.unknown())).default(() => []),
  custom_locations: z.array(CustomLocation).default(() => []),
  location_types: z.array(z.enum(["home", "recent", "travel_in"])).default(() => ["home" as const, "recent" as const]),
});

export const InterestEntry = z.object({ id: z.string(), name: z.string().nullish() });

export const FlexibleSpecBlock = z.object({
  interests: z.array(InterestEntry).default(() => []),
  behaviors: z.array(InterestEntry).default(() => []),
});

/** Required by Meta since 2024: explicit Advantage Audience on (1) / off (0). */
export const TargetingAutomation = z.object({
  advantage_audience: z.number().int().min(0).max(1).default(0),
});

export const TargetingInput = z
  .object({
    geo_locations: GeoLocations,
    age_min: z.number().int().min(13).max(65).default(18),
    age_max: z.number().int().min(13).max(65).default(65),
    genders: z.array(z.number().int()).default(() => []), // [1]=male, [2]=female, []=all
    locales: z.array(z.number().int()).default(() => []),
    flexible_spec: z.array(FlexibleSpecBlock).default(() => []),
    publisher_platforms: z.array(z.enum(PLATFORMS)).default(() => ["facebook" as const, "instagram" as const]),
    facebook_positions: z.array(z.string()).nullish(),
    instagram_positions: z.array(z.string()).nullish(),
    // Phone OS targeting, e.g. ["iOS"] / ["Android"]. Meta only allows it with
    // manual placements; device_platforms is then ["mobile"].
    user_os: z.array(z.string()).nullish(),
    device_platforms: z.array(z.enum(["mobile", "desktop"])).nullish(),
    targeting_automation: TargetingAutomation.default(() => ({ advantage_audience: 0 })),
  })
  .superRefine((t, ctx) => {
    if (t.age_max < t.age_min) {
      ctx.addIssue({ code: "custom", message: "targeting.age_max must be >= age_min", path: ["age_max"] });
    }
  });

export const PromotedObject = z.object({
  pixel_id: z.string().nullish(),
  custom_event_type: z.string().nullish(),
  application_id: z.string().nullish(),
  object_store_url: z.string().nullish(),
  page_id: z.string().nullish(),
});

const isoDateTime = z
  .string()
  .transform((s, ctx) => {
    const out = normalizeIsoDateTime(s);
    if (out === null) {
      ctx.addIssue({ code: "custom", message: "Invalid datetime" });
      return z.NEVER;
    }
    return out;
  });

export const AdSetInput = z
  .object({
    name: z.string(),
    optimization_goal: z.enum(OPTIMIZATION_GOALS).default("LINK_CLICKS"),
    billing_event: z.enum(BILLING_EVENTS).default("IMPRESSIONS"),
    bid_strategy: z.enum(BID_STRATEGIES).default("LOWEST_COST_WITHOUT_CAP"),
    bid_amount: minor.nullish(),
    daily_budget: minor.nullish(),
    lifetime_budget: minor.nullish(),
    start_time: isoDateTime.nullish(),
    end_time: isoDateTime.nullish(),
    destination_type: z.enum(DESTINATION_TYPES).default("WEBSITE"),
    promoted_object: PromotedObject.nullish(),
    targeting: TargetingInput,
    // EU Digital Services Act — required for EU placements.
    dsa_payor: z.string().nullish(),
    dsa_beneficiary: z.string().nullish(),
  })
  .superRefine((s, ctx) => {
    if (s.daily_budget == null && s.lifetime_budget == null) {
      ctx.addIssue({
        code: "custom",
        message: "ad_set must declare daily_budget or lifetime_budget (campaign-budget optimization is not in v1)",
      });
    }
    if (s.daily_budget && s.lifetime_budget) {
      ctx.addIssue({ code: "custom", message: "set only one of daily_budget or lifetime_budget on ad_set" });
    }
    if (s.start_time && s.end_time && Date.parse(s.end_time) <= Date.parse(s.start_time)) {
      ctx.addIssue({ code: "custom", message: "ad_set.end_time must be after start_time", path: ["end_time"] });
    }
  });

/* ---------- Level 3: Ad (single-image link ad) ---------- */

export const CTA_TYPES = [
  "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL", "DOWNLOAD",
  "GET_OFFER", "CONTACT_US", "APPLY_NOW", "SUBSCRIBE", "DONATE_NOW",
  "ORDER_NOW", "GET_QUOTE", "BUY_NOW", "INSTALL_APP",
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const CallToAction = z.object({
  type: z.enum(CTA_TYPES),
  value_link: z.string().nullish(), // usually equal to link_data.link
  // Lead-form ads (destination ON_AD): a real form id from /{page}/leadgen_forms.
  value_lead_gen_form_id: z.string().nullish(),
});

export const LinkData = z.object({
  image_hash: z.string(), // 1:1 — FB Feed + IG Feed; from a prior /adimages upload
  // Optional placement variants → builder emits asset_feed_spec.
  image_hash_story: z.string().nullish(), // 9:16 — Stories + Reels
  image_hash_portrait: z.string().nullish(), // 4:5 — IG Feed portrait
  message: z.string(), // primary text
  name: z.string(), // headline
  description: z.string().nullish(),
  link: z.string(),
  call_to_action: CallToAction,
});

export const ObjectStorySpec = z.object({
  page_id: z.string(),
  instagram_actor_id: z.string().nullish(),
  link_data: LinkData,
});

export const AdCreativeInput = z.object({
  name: z.string().nullish(),
  object_story_spec: ObjectStorySpec,
  url_tags: z.string().nullish(),
});

export const AdInput = z.object({ name: z.string(), creative: AdCreativeInput });

/* ---------- Lead form (destination ON_AD) ---------- */

export const PREFILLED_QUESTIONS = [
  "FULL_NAME", "FIRST_NAME", "LAST_NAME",
  "EMAIL", "PHONE", "PHONE_NUMBER",
  "CITY", "STATE", "COUNTRY", "POST_CODE",
  "GENDER", "DOB",
] as const;

/** Meta Instant Form — created on the Page before the ad, then its id is swapped in. */
export const LeadFormSpec = z.object({
  name: z.string(),
  privacy_url: z.string(),
  thank_you_message: z.string().default("Thanks! We'll be in touch."),
  custom_questions: z.array(z.string()).default(() => []),
  prefilled_questions: z
    .array(z.enum(PREFILLED_QUESTIONS))
    .default(() => ["FULL_NAME" as const, "EMAIL" as const, "PHONE_NUMBER" as const]),
  locale: z.string().default("en_US"),
});

/* ---------- Root ---------- */

export const CampaignSpec = z.object({
  ad_account_id: z.string(), // digits only; builders prepend act_
  campaign: CampaignInput,
  ad_set: AdSetInput,
  ad: AdInput,
  lead_form: LeadFormSpec.nullish(),
});

export type CampaignSpec = z.output<typeof CampaignSpec>;
export type CampaignSpecInput = z.input<typeof CampaignSpec>;
export type LeadFormSpec = z.output<typeof LeadFormSpec>;
export type LeadFormSpecInput = z.input<typeof LeadFormSpec>;

export class SpecValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Campaign spec failed validation with ${issues.length} error(s):\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "SpecValidationError";
    this.issues = issues;
  }
}

/** Parse + validate, with "path: message" lines like the Python validate.py. */
export function validateSpec(data: unknown): CampaignSpec {
  const r = CampaignSpec.safeParse(data);
  if (r.success) return r.data;
  throw new SpecValidationError(r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
}
