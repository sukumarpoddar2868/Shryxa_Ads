/**
 * Create-campaign blueprint: the Meta structure we mirror, and the draft
 * state the page holds. Each module is built out deeply later; `planned`
 * lists what each one will grow into.
 */
import { CURRENCY, type Currency, type Destination } from "../engine/presets.ts";
import type { CtaType } from "../engine/schema.ts";
import type { ReachScope } from "../ai/prompts.ts";

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
  { id: "OUTCOME_LEADS", label: "Leads", blurb: "Collect enquiries with an instant form, WhatsApp or calls.", available: true },
  { id: "OUTCOME_TRAFFIC", label: "Traffic", blurb: "Send people to your website or landing page.", available: true },
  { id: "OUTCOME_AWARENESS", label: "Awareness", blurb: "Show your ad to as many nearby people as possible.", available: false, note: "Later" },
  { id: "OUTCOME_ENGAGEMENT", label: "Engagement", blurb: "Get messages, video views or Page likes.", available: false, note: "Later" },
  { id: "OUTCOME_SALES", label: "Sales", blurb: "Find people likely to buy online.", available: false, note: "Needs Pixel" },
];

export type DeviceOs = "all" | "android" | "ios";
export const DEVICE_LABELS: Record<DeviceOs, string> = { all: "All phones", android: "Android", ios: "iPhone" };

/** A target circle. AI-made pins carry a one-line reason. */
export type DraftPin = { name: string; lat: number; lng: number; radiusKm: number; why: string };

/** Where people go after tapping the ad, per objective. */
export type DestinationOption = { id: Destination | "whatsapp" | "call"; label: string; blurb: string; available: boolean; note?: string };

export const DESTINATIONS_FOR: Record<"OUTCOME_LEADS" | "OUTCOME_TRAFFIC", DestinationOption[]> = {
  OUTCOME_LEADS: [
    { id: "lead_form", label: "Instant form", blurb: "A quick form inside Facebook/Instagram — name and phone are pre-filled.", available: true },
    { id: "whatsapp", label: "WhatsApp", blurb: "Opens a WhatsApp chat with the business.", available: false, note: "Soon" },
    { id: "call", label: "Phone call", blurb: "People tap to call the business.", available: false, note: "Soon" },
    { id: "website", label: "Website form", blurb: "Leads fill a form on your website.", available: false, note: "Needs Pixel" },
  ],
  OUTCOME_TRAFFIC: [{ id: "website", label: "Website", blurb: "Send people to a page on your website.", available: true }],
};

export const defaultDestination = (objective: ObjectiveId): Destination => (objective === "OUTCOME_TRAFFIC" ? "website" : "lead_form");

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
    /** Optional: who the ideal customer is — AI maps it to age, gender, phone type, interests. */
    idealCustomer: string;
  };
  /** True once the AI has filled the campaign; every field stays editable. */
  generated: boolean;
  campaign: {
    name: string;
    budgetType: "daily" | "lifetime";
    amount: string;
    currency: Currency;
    startDate: string;
    endDate: string;
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
  };
  placements: {
    mode: "advantage" | "manual";
    facebook: boolean;
    instagram: boolean;
  };
  ad: {
    destination: Destination;
    url: string;
    primaryText: string;
    headline: string;
    description: string;
    cta: CtaType;
  };
};

export const initialDraft = (client: { id: number; name: string } | null): Draft => ({
  objective: null,
  clientId: client?.id ?? null,
  setup: { businessName: client?.name ?? "", website: "", about: "", offer: "", cities: [], scope: "hyper-local", idealCustomer: "" },
  generated: false,
  campaign: { name: "", budgetType: "daily", amount: String(CURRENCY.INR.defaultDailyBudget), currency: "INR", startDate: "", endDate: "" },
  audience: { locations: [], ageMin: 18, ageMax: 65, gender: "any", language: "English", interests: [], mode: "strict", device: "all", why: "" },
  placements: { mode: "advantage", facebook: true, instagram: true },
  ad: { destination: "lead_form", url: "", primaryText: "", headline: "", description: "", cta: "GET_QUOTE" },
});

/** Section is "done" enough to show a tick in the rail. */
export function sectionComplete(id: SectionId, d: Draft): boolean {
  switch (id) {
    case "start":
      return d.generated;
    case "name-budget":
      return d.campaign.name.trim() !== "" && Number(d.campaign.amount) > 0;
    case "audience":
      return d.audience.locations.length > 0;
    case "placements":
      return d.placements.mode === "advantage" || d.placements.facebook || d.placements.instagram;
    case "creative":
      return (
        d.ad.primaryText.trim() !== "" &&
        d.ad.headline.trim() !== "" &&
        (d.ad.destination !== "website" || /^https?:\/\/\S+\.\S+/.test(d.ad.url))
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
    "Map with the pins and circles; drag to adjust",
    "Estimated audience size with a too-narrow warning",
    "Match AI interests to real Meta interests (country-aware)",
    "Retargeting: website visitors, Page/Instagram engagers, lead-form openers",
    "Customer list upload, lookalikes, and excluding existing customers",
  ],
  placements: ["Per-position control (Feed, Stories, Reels, right column)", "Placement preview per position"],
  creative: [
    "Image upload with 1:1, 4:5 and 9:16 crops (Supabase Storage → Meta)",
    "Rewrite / more variations of the AI copy",
    "Instant form builder (questions, privacy link, thank-you screen)",
    "WhatsApp, call and Messenger destinations",
    "Carousel and video formats, A/B variants",
    "Live mockups for Feed, Stories and Reels",
  ],
  review: ["Check with Meta (validate-only) before launch", "Launch paused by default, with readiness checks for the ad account"],
};
