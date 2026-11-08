/**
 * Create-campaign blueprint: the Meta structure we mirror, and the draft
 * state the page holds. Each module is built out deeply later; `planned`
 * lists what each one will grow into.
 */
import { CTA_FOR, CURRENCY, type ConversionEvent, type Currency, type Destination } from "../engine/presets.ts";
import type { CtaType } from "../engine/schema.ts";
import type { ReachScope } from "../ai/prompts.ts";
import type { MediaRef } from "../media/rules";

export type SectionId = "start" | "name-budget" | "audience" | "placements" | "creative" | "review";

export type Level = { id: "start" | "campaign" | "adset" | "ad" | "review"; label: string; sections: { id: SectionId; label: string }[] };

/** Meta's order: start (business + objective) → Campaign → Ad set → Ad → review. */
export const LEVELS: Level[] = [
  { id: "start", label: "Start", sections: [{ id: "start", label: "Business & goal" }] },
  { id: "campaign", label: "Campaign", sections: [{ id: "name-budget", label: "Name & budget" }] },
  { id: "adset", label: "Ad set", sections: [{ id: "audience", label: "Audience" }, { id: "placements", label: "Placements" }] },
  { id: "ad", label: "Ad", sections: [{ id: "creative", label: "Creative" }] },
  { id: "review", label: "Review", sections: [{ id: "review", label: "Review & launch" }] },
];

export const SECTION_ORDER: SectionId[] = LEVELS.flatMap((l) => l.sections.map((s) => s.id));

export type ObjectiveId = "OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT" | "OUTCOME_SALES";

export const OBJECTIVE_OPTIONS: {
  id: ObjectiveId;
  label: string;
  blurb: string;
  available: boolean;
  note?: string;
}[] = [
  { id: "OUTCOME_LEADS", label: "Leads", blurb: "Collect enquiries — instant form, WhatsApp chats or phone calls.", available: true },
  { id: "OUTCOME_TRAFFIC", label: "Traffic", blurb: "Send people to your website or landing page.", available: true },
  { id: "OUTCOME_AWARENESS", label: "Awareness", blurb: "Show your ad to as many nearby people as possible — great for openings and new shops.", available: true },
  { id: "OUTCOME_ENGAGEMENT", label: "Engagement", blurb: "Get people messaging you on WhatsApp, Messenger or Instagram.", available: true },
  { id: "OUTCOME_SALES", label: "Sales", blurb: "Find people likely to buy on your website. Needs a Meta Pixel.", available: true },
];

export type AdFormat = "single" | "carousel" | "video";
/** One carousel card (1:1 image). */
export type DraftCard = { id: string; headline: string; description: string; link: string; image?: MediaRef; /** Per-item WhatsApp message ("" = default template). */ waMessage?: string };

/** WhatsApp setup: greeting + what the customer sends; per-item links for carousels. */
export type DraftWhatsApp = {
  greeting: string;
  style: "prefill" | "questions";
  prefill: string;
  questions: string[];
  /** Carousel only: each card opens WhatsApp with its own message + item picture (runs as Traffic). */
  perItem: boolean;
};

/** Uploaded media for single-image (feed/portrait/story) and video ads. */
export type DraftMedia = { feed?: MediaRef; portrait?: MediaRef; story?: MediaRef; video?: MediaRef };
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

/** Headline is valid when present and within Meta's 40 characters. */
export const cardReady = (c: DraftCard) => c.headline.trim() !== "" && c.headline.length <= 40;

/** Required media per format: feed image · every card image · the video. */
export function mediaReady(d: Draft): boolean {
  if (d.ad.format === "video") return Boolean(d.ad.media.video);
  if (d.ad.format === "carousel") return d.ad.carousel.cards.length > 0 && d.ad.carousel.cards.every((c) => c.image);
  return Boolean(d.ad.media.feed);
}

/** Instant form (destination lead_form). Contact fields are pre-filled by Meta. */
export type DraftLeadForm = { name: string; privacyUrl: string; fields: ContactField[]; questions: string[]; thankYou: string };
export const CONTACT_FIELDS = {
  FULL_NAME: "Full name",
  PHONE_NUMBER: "Phone number",
  EMAIL: "Email",
  CITY: "City",
  POST_CODE: "PIN / ZIP code",
  STATE: "State",
  GENDER: "Gender",
  DOB: "Date of birth",
} as const;
export type ContactField = keyof typeof CONTACT_FIELDS;
export const MAX_FORM_QUESTIONS = 5;
export const isHttpsUrl = (u: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u.trim());

export function leadFormReady(d: Draft): boolean {
  if (d.ad.destination !== "lead_form") return true;
  const f = d.ad.leadForm;
  return isHttpsUrl(f.privacyUrl) && f.fields.length > 0 && f.questions.every((q) => q.trim().length > 0 && q.length <= 80);
}

/** Website goals that count conversions with the Pixel (Sales, website leads). */
export const websiteConversions = (d: Draft) => d.ad.destination === "website" && (d.objective === "OUTCOME_SALES" || d.objective === "OUTCOME_LEADS");

/** Destination-specific details are filled in. */
export function destinationReady(d: Draft): boolean {
  switch (d.ad.destination) {
    case "website":
      return isHttpsUrl(d.ad.url) && (!websiteConversions(d) || Boolean(d.ad.pixel));
    case "call":
      return isPhone(d.ad.phone);
    case "whatsapp": {
      const w = d.ad.whatsapp;
      const textOk = w.style === "prefill" ? w.prefill.trim().length > 0 : w.questions.some((q) => q.trim());
      if (w.perItem && d.ad.format === "carousel") return isPhone(d.ad.whatsappNumber);
      return isPhone(d.ad.whatsappNumber) && w.greeting.trim().length > 0 && textOk;
    }
    default:
      return true;
  }
}

export type AudienceType = "core" | "custom" | "lookalike";
export type SelectedAudience = { id: string; name: string; kind: string };

/** Custom/lookalike need at least one matching audience picked. */
export function audienceReady(d: Draft): boolean {
  const a = d.audience;
  if (a.type === "custom") return a.include.some((x) => x.kind !== "lookalike");
  if (a.type === "lookalike") return a.include.some((x) => x.kind === "lookalike");
  return true;
}

export type DeviceOs = "all" | "android" | "ios";
export const DEVICE_LABELS: Record<DeviceOs, string> = { all: "All phones", android: "Android", ios: "iPhone" };

/** A target circle. AI-made pins carry a one-line reason. */
export type DraftPin = { name: string; lat: number; lng: number; radiusKm: number; why: string };

export type DestinationOption = { id: Destination; label: string; blurb: string; available: boolean; note?: string };

/** What the client has connected — some destinations need it. */
type ClientCaps = { hasPixel?: boolean; hasInstagram?: boolean } | undefined;

/** Destinations per objective, with availability for this client. */
export function destinationOptions(objective: ObjectiveId, client: ClientCaps): DestinationOption[] {
  const pixel = client?.hasPixel ? {} : { note: "Pixel setup included" };
  const ig = client?.hasInstagram ? {} : { available: false, note: "Needs Instagram" };
  const opt = (id: Destination, label: string, blurb: string, extra: Partial<DestinationOption> = {}): DestinationOption => ({ id, label, blurb, available: true, ...extra });
  switch (objective) {
    case "OUTCOME_LEADS":
      return [
        opt("lead_form", "Instant form", "A quick form inside Facebook/Instagram — name and phone are pre-filled."),
        opt("whatsapp", "WhatsApp", "Opens a WhatsApp chat with the business. The Page must be linked to WhatsApp Business."),
        opt("call", "Phone call", "People tap to call the business. Mobile only."),
        opt("website", "Website form", "Leads fill a form on your website — tracked by your Pixel.", pixel),
      ];
    case "OUTCOME_TRAFFIC":
      return [
        opt("website", "Website", "Send people to a page on your website."),
        opt("instagram_profile", "Instagram profile", "Get profile visits and followers. Runs on Instagram only.", ig),
      ];
    case "OUTCOME_AWARENESS":
      return [opt("none", "Reach people nearby", "No click goal — Meta shows the ad to as many people in your areas as possible.")];
    case "OUTCOME_ENGAGEMENT":
      return [
        opt("whatsapp", "WhatsApp", "Start chats on WhatsApp. The Page must be linked to WhatsApp Business."),
        opt("messenger", "Messenger", "Start chats with your Facebook Page."),
        opt("instagram_dm", "Instagram Direct", "Start DMs with your Instagram account.", ig),
      ];
    case "OUTCOME_SALES":
      return [opt("website", "Website purchases", "People buy on your website — tracked by your Pixel.", pixel)];
  }
}

export const defaultDestination = (objective: ObjectiveId): Destination =>
  ({ OUTCOME_LEADS: "lead_form", OUTCOME_TRAFFIC: "website", OUTCOME_AWARENESS: "none", OUTCOME_ENGAGEMENT: "whatsapp", OUTCOME_SALES: "website" })[objective] as Destination;

export const DESTINATION_LABELS: Record<Destination, string> = {
  website: "Website",
  lead_form: "Instant form",
  whatsapp: "WhatsApp chat",
  call: "Phone call",
  messenger: "Messenger chat",
  instagram_dm: "Instagram Direct",
  instagram_profile: "Instagram profile",
  none: "Reach (no click goal)",
};

/** Default button for a destination (website depends on the goal). */
export function defaultCta(objective: ObjectiveId, destination: Destination): CtaType {
  if (destination === "website") return objective === "OUTCOME_SALES" ? "SHOP_NOW" : objective === "OUTCOME_LEADS" ? "SIGN_UP" : "LEARN_MORE";
  if (destination === "lead_form") return "GET_QUOTE";
  return CTA_FOR[destination][0];
}

/** International phone number, digits only with a leading +. */
export const cleanPhone = (p: string) => p.replace(/[^\d+]/g, "");
export const isPhone = (p: string) => /^\+[1-9]\d{7,14}$/.test(cleanPhone(p));

export type Draft = {
  objective: ObjectiveId | null;
  clientId: number | null;
  /** What the user tells the AI (Setup step). */
  setup: {
    businessName: string;
    website: string;
    about: string;
    offer: string;
    cities: string[];
    scope: ReachScope;
  };
  /** True once the AI has filled the campaign; every field stays editable. */
  generated: boolean;
  /** Set after a successful live launch (prevents launching twice). */
  launched: { campaignId: string; adsManagerUrl: string | null } | null;
  campaign: {
    name: string;
    budgetType: "daily" | "lifetime";
    amount: string;
    currency: Currency;
    startDate: string;
    endDate: string;
    /** Awareness only: max times one person sees the ad per 7 days. */
    frequencyCap: number;
  };
  audience: {
    locations: DraftPin[];
    ageMin: number;
    ageMax: number;
    gender: "any" | "female" | "male";
    language: string;
    interests: string[];
    mode: "strict" | "advantage";
    /** Phone type. Anything but "all" forces manual placements (Meta rule). */
    device: DeviceOs;
    /** AI's one-line reason for the age/gender/phone choice. */
    why: string;
    /** Core = location/age/gender/interests (default). Custom / lookalike add Meta audiences on top. */
    type: AudienceType;
    include: SelectedAudience[];
    /** Excluded audiences (e.g. existing customers) — any type. */
    exclude: SelectedAudience[];
  };
  placements: {
    mode: "advantage" | "manual";
    facebook: boolean;
    instagram: boolean;
  };
  ad: {
    destination: Destination;
    url: string;
    /** Call ads: number with country code. */
    phone: string;
    /** WhatsApp ads: optional business number (else the Page's linked one). */
    whatsappNumber: string;
    /** Website conversions (Sales / website leads): Pixel event to optimise for. */
    conversionEvent: ConversionEvent;
    whatsapp: DraftWhatsApp;
    /** Meta Pixel used for website goals (saved on the client too). */
    pixel: { id: string; name: string } | null;
    primaryText: string;
    headline: string;
    description: string;
    cta: CtaType;
    format: AdFormat;
    media: DraftMedia;
    leadForm: DraftLeadForm;
    /** AI card ideas from Start, used when switching to carousel. */
    cardIdeas: { headline: string; description: string }[];
    carousel: { cards: DraftCard[]; optimizeOrder: boolean; endCard: boolean };
  };
};

export const initialDraft = (client: { id: number; name: string; pixelId?: string | null; pixelName?: string | null } | null): Draft => ({
  objective: null,
  clientId: client?.id ?? null,
  setup: { businessName: client?.name ?? "", website: "", about: "", offer: "", cities: [], scope: "hyper-local" },
  generated: false,
  launched: null,
  campaign: { name: "", budgetType: "daily", amount: String(CURRENCY.INR.defaultDailyBudget), currency: "INR", startDate: "", endDate: "", frequencyCap: 2 },
  audience: { locations: [], ageMin: 18, ageMax: 65, gender: "any", language: "English", interests: [], mode: "strict", device: "all", why: "", type: "core", include: [], exclude: [] },
  placements: { mode: "advantage", facebook: true, instagram: true },
  ad: { destination: "lead_form", url: "", phone: "", whatsappNumber: "", conversionEvent: "LEAD", whatsapp: { greeting: "", style: "prefill", prefill: "", questions: [], perItem: false }, pixel: client?.pixelId ? { id: client.pixelId, name: client.pixelName ?? `Pixel ${client.pixelId}` } : null, primaryText: "", headline: "", description: "", cta: "GET_QUOTE", format: "single", media: {}, leadForm: { name: "", privacyUrl: "", fields: ["FULL_NAME", "PHONE_NUMBER", "EMAIL"], questions: [], thankYou: "Thanks! We'll call you back shortly." }, cardIdeas: [], carousel: { cards: [], optimizeOrder: true, endCard: false } },
});

/**
 * Fill any missing fields from the defaults. Protects against drafts created
 * before a field existed (e.g. state kept across a dev hot-reload).
 */
export function normalizeDraft(d: Draft): Draft {
  const base = initialDraft(null);
  const out: Draft = {
    ...base,
    ...d,
    setup: { ...base.setup, ...d.setup },
    campaign: { ...base.campaign, ...d.campaign },
    audience: { ...base.audience, ...d.audience },
    placements: { ...base.placements, ...d.placements },
    ad: {
      ...base.ad,
      ...d.ad,
      media: { ...base.ad.media, ...d.ad?.media },
      leadForm: { ...base.ad.leadForm, ...d.ad?.leadForm },
      whatsapp: { ...base.ad.whatsapp, ...d.ad?.whatsapp },
      carousel: { ...base.ad.carousel, ...d.ad?.carousel },
    },
  };
  // Keep the button valid for the destination (lists can change between versions).
  if (out.objective && !CTA_FOR[out.ad.destination].includes(out.ad.cta)) out.ad = { ...out.ad, cta: defaultCta(out.objective, out.ad.destination) };
  return out;
}

/** Section is "done" enough to show a tick in the rail. */
export function sectionComplete(id: SectionId, d: Draft): boolean {
  switch (id) {
    case "start":
      return d.generated;
    case "name-budget":
      return d.campaign.name.trim() !== "" && Number(d.campaign.amount) > 0;
    case "audience":
      return d.audience.locations.length > 0 && audienceReady(d);
    case "placements":
      return d.placements.mode === "advantage" || d.placements.facebook || d.placements.instagram;
    case "creative":
      return (
        d.ad.primaryText.trim() !== "" &&
        mediaReady(d) &&
        leadFormReady(d) &&
        (d.ad.format === "carousel"
          ? d.ad.carousel.cards.length >= CAROUSEL_MIN && d.ad.carousel.cards.every(cardReady)
          : d.ad.headline.trim() !== "") &&
        destinationReady(d)
      );
    case "review":
      return false;
  }
}

/** What each module grows into later (from the targeting research). */
export const PLANNED: Partial<Record<SectionId, string[]>> = {
  start: [
    "Awareness, Engagement and Sales objectives",
    "WhatsApp and phone-call destinations",
    "Remember each client's business description for next time",
    "Upload a brochure or link the website for the AI to read",
    "Saved templates agencies can reuse across clients",
  ],
  "name-budget": [
    "Budget guidance per city and objective",
    "Campaign budget (Advantage+) vs ad set budget",
    "Spend cap editor and ad scheduling (dayparting)",
  ],
  audience: [
    "Match AI interests to real Meta interests (country-aware)",
    "More custom audiences: lead-form openers, video viewers, WhatsApp chatters",
  ],
  placements: ["Per-position control (Feed, Stories, Reels, right column)", "Placement preview per position"],
  creative: [
    "Crop / trim editor for images and video",
    "Rewrite / more variations of the AI copy",
    "WhatsApp, call and Messenger destinations",
    "A/B variants (two images or two headlines)",
    "Live mockups for Feed, Stories and Reels",
  ],
  review: ["Save drafts and launched campaigns in Shryxa", "Ad-account readiness (payment method, status) before launch"],
};
