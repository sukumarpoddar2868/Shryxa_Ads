/**
 * Wizard inputs → raw campaign spec. Port of the root `yaml_render.py`.
 * The output is unvalidated input for `validateSpec()`.
 */
import { LEAD_FORM_REF, type Json, type JsonObject } from "./builders.ts";
import {
  COUNTRY_TO_ISO,
  CURRENCY,
  CURRENCY_TO_COUNTRY,
  GENDER_TO_META,
  LANGUAGE_TO_LOCALES,
  toMinor,
  type Currency,
  type Destination,
} from "./presets.ts";
import type { CampaignSpecInput, CtaType, LeadFormSpecInput } from "./schema.ts";

export type AdCopy = {
  primary_text: string;
  headline: string;
  description?: string | null;
  call_to_action?: CtaType | null;
  age_min?: number;
  age_max?: number;
  gender?: string | null;
  /** Only resolved `{id, name}` entries are used; raw names are dropped. */
  interest_targeting?: (string | { id: string; name?: string })[];
};

export type Epicenter = { lat: number; lng: number; radius_km: number };

export type RenderInput = {
  /** The client's saved Meta assets. `ad_account_id` may carry `act_`. */
  client: {
    business_name: string;
    ad_account_id: string;
    page_id: string;
    instagram_actor_id?: string | null;
    website_url?: string | null;
  };
  currency: Currency;
  adCopy: AdCopy;
  epicenters: Epicenter[];
  /** Major units (₹500, $20). */
  dailyBudget: number;
  destination: Destination;
  ctaType?: CtaType | null;
  landingPageUrl?: string | null;
  leadForm?: LeadFormSpecInput | null;
  country?: string | null;
  language?: string;
  imageHash?: string | null;
  imageHashStory?: string | null;
  imageHashPortrait?: string | null;
  bidStrategy?: string;
  objective?: string | null;
  specialAdCategory?: string;
  /** YYYY-MM-DD */
  startDate?: string | null;
  endDate?: string | null;
  launchStatus?: "PAUSED" | "ACTIVE";
  /** Phone OS targeting. Not "all" ⇒ mobile only, manual placements. */
  deviceOs?: "all" | "android" | "ios";
  /** Manual placements; omitted = Advantage+ (all platforms). */
  publisherPlatforms?: ("facebook" | "instagram")[];
  /** Name suffix (YYMMDD-HHMMSS) so retries don't collide in Ads Manager. */
  stamp?: string;
};

const truncate = (s: string, n: number) => {
  const cp = Array.from(s);
  return cp.length <= n ? s : cp.slice(0, n - 1).join("").trimEnd() + "…";
};

/** YYMMDD-HHMMSS in UTC. */
export function nameStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

const STAMP_SUFFIX = /\s+\d{6}-\d{6}\s*$/;

export function renderSpec(input: RenderInput): CampaignSpecInput {
  const { client, currency, adCopy } = input;
  const stamp = input.stamp ?? nameStamp(new Date());
  const country = input.country || CURRENCY_TO_COUNTRY[currency];
  const countryIso = COUNTRY_TO_ISO[country] ?? "US";
  const locales = LANGUAGE_TO_LOCALES[input.language ?? "English"] ?? [];

  const isLeadForm = input.destination === "lead_form";
  const linkTarget = input.landingPageUrl || client.website_url || "https://example.com";
  const ctaType = input.ctaType || adCopy.call_to_action || (isLeadForm ? "GET_QUOTE" : "LEARN_MORE");
  const objective = input.objective || (isLeadForm ? "OUTCOME_LEADS" : "OUTCOME_TRAFFIC");
  const pref = (adCopy.gender || "any").toLowerCase();
  const genders = [...(GENDER_TO_META[pref as keyof typeof GENDER_TO_META] ?? [])];

  // Meta rejects country + custom circles as overlapping → one or the other.
  const geo: JsonObject = { location_types: ["home", "recent"] };
  if (input.epicenters.length) {
    geo.custom_locations = input.epicenters.map((e) => ({
      latitude: Number(e.lat),
      longitude: Number(e.lng),
      radius: Number(e.radius_km),
      distance_unit: "kilometer",
    }));
  } else {
    geo.countries = [countryIso];
  }

  // Placeholder / zero ids are rejected by Meta → keep resolved ids only.
  const interests = (adCopy.interest_targeting ?? [])
    .filter((i): i is { id: string; name?: string } => typeof i === "object" && i !== null)
    .filter((i) => !["", "0", "0000000000000"].includes(String(i.id ?? "").trim()));
  const flexibleSpec: Json[] = interests.length ? [{ interests: interests.slice(0, 5) as Json[] }] : [];

  const dailyMinor = toMinor(input.dailyBudget, currency);
  const pageId = String(client.page_id);
  const name = client.business_name;

  const adSet: JsonObject = {
    name: `${name} — Default — Ad set ${stamp}`,
    optimization_goal: isLeadForm ? "LEAD_GENERATION" : "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    bid_strategy: input.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP",
    daily_budget: dailyMinor,
    destination_type: isLeadForm ? "ON_AD" : "WEBSITE",
    targeting: {
      geo_locations: geo,
      age_min: Math.trunc(adCopy.age_min ?? 18),
      age_max: Math.trunc(adCopy.age_max ?? 65),
      genders,
      locales,
      flexible_spec: flexibleSpec,
      publisher_platforms: input.publisherPlatforms?.length ? input.publisherPlatforms : ["facebook", "instagram"],
      ...(input.deviceOs && input.deviceOs !== "all"
        ? { user_os: [input.deviceOs === "ios" ? "iOS" : "Android"], device_platforms: ["mobile"] }
        : {}),
      // Advantage Audience off: delivery stays strict to the geo we set.
      targeting_automation: { advantage_audience: 0 },
    },
  };
  // LEAD_GENERATION needs the Page that owns the leads as promoted object.
  if (isLeadForm) adSet.promoted_object = { page_id: pageId };
  if (input.startDate) adSet.start_time = `${input.startDate}T00:00:00+0000`;
  if (input.endDate) adSet.end_time = `${input.endDate}T23:59:00+0000`;

  const linkData: JsonObject = {
    image_hash: input.imageHash || "REPLACE_WITH_UPLOADED_HASH",
    message: adCopy.primary_text ?? "",
    name: truncate(adCopy.headline ?? "", 40),
    link: linkTarget,
    call_to_action: isLeadForm
      ? { type: ctaType, value_lead_gen_form_id: LEAD_FORM_REF }
      : { type: ctaType, value_link: linkTarget },
  };
  if (adCopy.description) linkData.description = truncate(adCopy.description, 125);
  if (input.imageHashStory) linkData.image_hash_story = input.imageHashStory;
  if (input.imageHashPortrait) linkData.image_hash_portrait = input.imageHashPortrait;

  const spec: JsonObject = {
    ad_account_id: String(client.ad_account_id).replace(/^act_/, ""),
    campaign: {
      name: `${name} — ${isLeadForm ? "Leads" : "Traffic"} ${stamp}`,
      objective,
      status: input.launchStatus ?? "PAUSED",
      special_ad_categories: [input.specialAdCategory ?? "NONE"],
      buying_type: "AUCTION",
      spend_cap: dailyMinor * CURRENCY[currency].defaultSpendCapMultiplier,
    },
    ad_set: adSet,
    ad: {
      name: `${name} — single image ${stamp}`,
      creative: {
        name: `${name} creative ${stamp}`,
        object_story_spec: {
          page_id: pageId,
          ...(client.instagram_actor_id ? { instagram_actor_id: String(client.instagram_actor_id) } : {}),
          link_data: linkData,
        },
      },
    },
  };

  if (isLeadForm && input.leadForm) {
    // Form names must be unique per Page → fresh stamp on every attempt.
    const base = String(input.leadForm.name || "Lead form").replace(STAMP_SUFFIX, "").trim();
    spec.lead_form = { ...(input.leadForm as JsonObject), name: `${base} ${stamp}` };
  }

  return spec as unknown as CampaignSpecInput;
}
