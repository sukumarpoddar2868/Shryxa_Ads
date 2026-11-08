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
  /** Carousel cards (2–10). When given, the ad is a carousel. */
  carousel?: {
    cards: { imageHash: string; headline: string; description?: string | null; link?: string | null }[];
    optimizeOrder?: boolean;
    endCard?: boolean;
  } | null;
  /** Video ad: Meta video id (from /advideos) + cover image hash. Replaces the image/carousel. */
  video?: { videoId: string; thumbnailHash: string } | null;
  /** The user's campaign name (else "<business> — Leads/Traffic <stamp>"). */
  campaignName?: string | null;
  /** "lifetime" puts the amount on lifetime_budget (needs endDate) and caps spend at it. */
  budgetType?: "daily" | "lifetime";
  /** Advantage+ audience: Meta may reach beyond age/gender/interests (never beyond the areas). */
  advantageAudience?: boolean;
  /** Call ads: number in international format, e.g. +919876543210. */
  phoneNumber?: string | null;
  /** WhatsApp ads: optional business number (else the Page's linked number). */
  whatsappNumber?: string | null;
  /** WhatsApp chat ads: what the customer sees when the chat opens. */
  whatsappChat?: { greeting: string; prefill?: string | null; questions?: string[] } | null;
  /** Website conversions (Sales / website leads): the client's Pixel + event. */
  pixel?: { pixelId: string; event: string } | null;
  /** Awareness: max impressions per person per 7 days. */
  frequencyCap?: number | null;
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

const OBJECTIVE_WORD: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_SALES: "Sales",
};

/**
 * Objective × destination → Meta ad-set routing (per Meta's docs):
 *   lead_form    ON_AD        LEAD_GENERATION  promoted {page_id}
 *   whatsapp     WHATSAPP     CONVERSATIONS    promoted {page_id}  CTA WHATSAPP_MESSAGE · app_destination
 *   messenger    MESSENGER    CONVERSATIONS    promoted {page_id}  CTA MESSAGE_PAGE · app_destination
 *   instagram_dm INSTAGRAM_DIRECT CONVERSATIONS promoted {page_id} CTA INSTAGRAM_MESSAGE · app_destination
 *   call         PHONE_CALL   QUALITY_CALL                         CTA CALL_NOW · tel:
 *   website      WEBSITE      LINK_CLICKS (Traffic) | OFFSITE_CONVERSIONS + {pixel_id, event} (Leads/Sales)
 *   none         (Awareness)  REACH
 */
function routeFor(objective: string, dest: Destination, pageId: string) {
  const pageUrl = `https://www.facebook.com/${pageId}`;
  const base = { pageUrl, link: null as string | null, cta: null as CtaType | null, appDestination: null as string | null, pagePromoted: false, pixel: false };
  switch (dest) {
    case "lead_form":
      return { ...base, destinationType: "ON_AD", goal: "LEAD_GENERATION", pagePromoted: true };
    case "whatsapp":
      return { ...base, destinationType: "WHATSAPP", goal: "CONVERSATIONS", pagePromoted: true, link: "https://api.whatsapp.com/send", cta: "WHATSAPP_MESSAGE" as CtaType, appDestination: "WHATSAPP" };
    case "messenger":
      return { ...base, destinationType: "MESSENGER", goal: "CONVERSATIONS", pagePromoted: true, link: "https://fb.com/messenger_doc/", cta: "MESSAGE_PAGE" as CtaType, appDestination: "MESSENGER" };
    case "instagram_dm":
      return { ...base, destinationType: "INSTAGRAM_DIRECT", goal: "CONVERSATIONS", pagePromoted: true, link: "https://www.instagram.com", cta: "INSTAGRAM_MESSAGE" as CtaType, appDestination: "INSTAGRAM_DIRECT" };
    case "call":
      return { ...base, destinationType: "PHONE_CALL", goal: "QUALITY_CALL", cta: "CALL_NOW" as CtaType };
    case "none":
      return { ...base, destinationType: "WEBSITE", goal: "REACH" };
    case "website":
      return objective === "OUTCOME_LEADS" || objective === "OUTCOME_SALES"
        ? { ...base, destinationType: "WEBSITE", goal: "OFFSITE_CONVERSIONS", pixel: true }
        : { ...base, destinationType: "WEBSITE", goal: "LINK_CLICKS" };
  }
}

/**
 * Click-to-WhatsApp greeting (Meta "VISUAL_EDITOR" v2 spec): the business's
 * greeting plus either a pre-filled customer message or tappable questions.
 */
export function whatsappWelcome(c: { greeting: string; prefill?: string | null; questions?: string[] }): string {
  const questions = (c.questions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 4);
  const message: Record<string, unknown> = { text: c.greeting.trim() };
  let action = "autofill_message";
  if (questions.length) {
    action = "ice_breakers";
    message.ice_breakers = questions.map((title) => ({ title }));
  } else {
    message.autofill_message = { content: (c.prefill ?? "").trim() || "Hi! I'd like to know more about this." };
  }
  return JSON.stringify({
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: { customer_action_type: action, message },
  });
}

export function renderSpec(input: RenderInput): CampaignSpecInput {
  const { client, currency, adCopy } = input;
  const stamp = input.stamp ?? nameStamp(new Date());
  const country = input.country || CURRENCY_TO_COUNTRY[currency];
  const countryIso = COUNTRY_TO_ISO[country] ?? "US";
  const locales = LANGUAGE_TO_LOCALES[input.language ?? "English"] ?? [];

  const dest = input.destination;
  const isLeadForm = dest === "lead_form";
  const objective = input.objective || (isLeadForm ? "OUTCOME_LEADS" : "OUTCOME_TRAFFIC");
  const route = routeFor(objective, dest, String(client.page_id));
  const linkTarget = route.link ?? (input.landingPageUrl || client.website_url || (dest === "none" || dest === "call" ? route.pageUrl : "https://example.com"));
  const ctaType = route.cta ?? (input.ctaType || adCopy.call_to_action || (isLeadForm ? "GET_QUOTE" : "LEARN_MORE"));
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
  const lifetime = input.budgetType === "lifetime";
  const pageId = String(client.page_id);
  const name = client.business_name;
  const custom = input.campaignName?.trim();

  const adSet: JsonObject = {
    name: custom ? `${custom} — Ad set ${stamp}` : `${name} — Default — Ad set ${stamp}`,
    optimization_goal: route.goal,
    billing_event: "IMPRESSIONS",
    bid_strategy: input.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP",
    ...(lifetime ? { lifetime_budget: dailyMinor } : { daily_budget: dailyMinor }),
    destination_type: route.destinationType,
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
        : dest === "call"
          ? { device_platforms: ["mobile"] } // people must be able to tap-to-call
          : {}),
      // Advantage Audience off: delivery stays strict to the geo we set.
      targeting_automation: { advantage_audience: input.advantageAudience ? 1 : 0 },
    },
  };
  // LEAD_GENERATION needs the Page that owns the leads as promoted object.
  if (route.pagePromoted) {
    adSet.promoted_object = {
      page_id: pageId,
      ...(dest === "whatsapp" && input.whatsappNumber ? { whatsapp_phone_number: input.whatsappNumber } : {}),
    };
  }
  if (route.pixel) {
    if (!input.pixel) throw new Error("Website conversions need the client's Pixel.");
    adSet.promoted_object = { pixel_id: input.pixel.pixelId, custom_event_type: input.pixel.event };
  }
  if (objective === "OUTCOME_AWARENESS" && input.frequencyCap) {
    adSet.frequency_control_specs = [{ event: "IMPRESSIONS", interval_days: 7, max_frequency: Math.trunc(input.frequencyCap) }];
  }
  if (input.startDate) adSet.start_time = `${input.startDate}T00:00:00+0000`;
  if (input.endDate) adSet.end_time = `${input.endDate}T23:59:00+0000`;

  const linkData: JsonObject = {
    image_hash: input.imageHash || "REPLACE_WITH_UPLOADED_HASH",
    message: adCopy.primary_text ?? "",
    name: truncate(adCopy.headline ?? "", 40),
    link: linkTarget,
    call_to_action: isLeadForm
      ? { type: ctaType, value_lead_gen_form_id: LEAD_FORM_REF }
      : route.appDestination
        ? { type: ctaType, value_app_destination: route.appDestination }
        : dest === "call"
          ? { type: ctaType, value_link: `tel:${(input.phoneNumber ?? "").replace(/[^\d+]/g, "")}` }
          : { type: ctaType, value_link: linkTarget },
  };
  if (adCopy.description) linkData.description = truncate(adCopy.description, 125);
  if (dest === "whatsapp" && input.whatsappChat) linkData.page_welcome_message = whatsappWelcome(input.whatsappChat);
  if (input.imageHashStory) linkData.image_hash_story = input.imageHashStory;
  if (input.imageHashPortrait) linkData.image_hash_portrait = input.imageHashPortrait;
  if (input.carousel && input.carousel.cards.length) {
    linkData.child_attachments = input.carousel.cards.map((c) => ({
      image_hash: c.imageHash,
      name: truncate(c.headline, 40),
      ...(c.description ? { description: truncate(c.description, 125) } : {}),
      ...(c.link ? { link: c.link } : {}),
    }));
    linkData.multi_share_optimized = input.carousel.optimizeOrder ?? true;
    linkData.multi_share_end_card = input.carousel.endCard ?? false;
    delete linkData.image_hash;
    delete linkData.image_hash_story;
    delete linkData.image_hash_portrait;
  }

  const spec: JsonObject = {
    ad_account_id: String(client.ad_account_id).replace(/^act_/, ""),
    campaign: {
      name: custom || `${name} — ${OBJECTIVE_WORD[objective] ?? "Campaign"} ${stamp}`,
      objective,
      status: input.launchStatus ?? "PAUSED",
      special_ad_categories: [input.specialAdCategory ?? "NONE"],
      buying_type: "AUCTION",
      spend_cap: lifetime ? dailyMinor : dailyMinor * CURRENCY[currency].defaultSpendCapMultiplier,
    },
    ad_set: adSet,
    ad: {
      name: `${custom || name} — ${input.video ? "video" : input.carousel?.cards.length ? "carousel" : "single image"} ${stamp}`,
      creative: {
        name: `${custom || name} creative ${stamp}`,
        object_story_spec: {
          page_id: pageId,
          ...(client.instagram_actor_id ? { instagram_actor_id: String(client.instagram_actor_id) } : {}),
          ...(input.video
            ? {
                video_data: {
                  video_id: input.video.videoId,
                  image_hash: input.video.thumbnailHash,
                  message: linkData.message,
                  title: linkData.name,
                  ...(linkData.description ? { link_description: linkData.description } : {}),
                  link: linkTarget,
                  call_to_action: linkData.call_to_action,
                  ...(linkData.page_welcome_message ? { page_welcome_message: linkData.page_welcome_message } : {}),
                },
              }
            : { link_data: linkData }),
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
