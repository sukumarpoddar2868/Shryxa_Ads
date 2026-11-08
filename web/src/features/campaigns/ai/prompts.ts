/**
 * Prompts, output schemas and clean-up for AI campaign setup.
 * Port of the root `llm_resolver.py`, extended so the AI also proposes the
 * campaign name, daily budget and call-to-action. Pure: no server-only.
 */
import { z } from "zod";
import { CURRENCY, type Currency, type Destination } from "../engine/presets.ts";
import type { CtaType } from "../engine/schema.ts";

/* ---------- Locations ---------- */

export const REACH_SCOPES = ["hyper-local", "local", "city-wide", "metro"] as const;
export type ReachScope = (typeof REACH_SCOPES)[number];

export const SCOPE_INFO: Record<ReachScope, { label: string; blurb: string }> = {
  "hyper-local": { label: "Hyper-local", blurb: "3 neighbourhoods per city · ~1.5 km each · tightest, least waste" },
  local: { label: "Local", blurb: "1 circle per city · 3–10 km · single-location service" },
  "city-wide": { label: "City-wide", blurb: "1 circle per city · 10–25 km · mid-size service or retail" },
  metro: { label: "Metro", blurb: "1 circle per city · 25–60 km · regional brand" },
};

export const Pin = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_km: z.number().min(1).max(80),
  why: z.string().default(""),
});
export type Pin = z.output<typeof Pin>;

export const LocationGuess = z.object({ cities: z.array(Pin).min(1).max(30) });

export function locationPrompt(p: {
  cities: string[];
  businessName: string;
  about: string;
  country: string;
  scope: ReachScope;
}): string {
  return `You are resolving target locations for a Meta (Facebook + Instagram) ad campaign.

The user has entered these cities to target:
${p.cities.map((c) => `  • ${c}`).join("\n")}

Business context:
  Business name: ${p.businessName || "(not provided)"}
  Description:   ${p.about || "(not provided)"}
  Country:       ${p.country}
  Reach scope:   ${p.scope}

------------------------------------------------------------------
SCOPE RULES — follow EXACTLY. Wider scopes burn money on irrelevant
audience; narrower scopes deliver tightly relevant impressions.
------------------------------------------------------------------

If reach scope is "hyper-local":
  → For EACH input city, return EXACTLY 3 distinct sub-clusters centred on
    specific neighbourhoods, localities, or business districts most likely
    to contain this business's customers.
  → Each cluster: 1.0–2.0 km radius. Default to 1.5 km if unsure.
  → The \`name\` field MUST be "<Neighbourhood> — <City>" (em dash),
    e.g. "Indiranagar — Bangalore".
  → Choose neighbourhoods from the business context, e.g.
      • CA / tax / legal firm → high-income residential + business districts
      • Restaurant / cafe     → dense residential + nearby office cluster
      • Dental / clinic       → affluent residential within driving distance
      • Coworking / B2B SaaS  → tech hubs, IT parks, business districts
  → The \`why\` field must NAME the neighbourhood and explain in one sentence
    why it fits this business.

If reach scope is "local":     ONE pick per input city. Radius 3–10 km.
If reach scope is "city-wide": ONE pick per input city. Radius 10–25 km.
If reach scope is "metro":     ONE pick per input city. Radius 25–60 km.
For these, \`name\` is "<City>, <State>".

------------------------------------------------------------------
For every pick return accurate latitude/longitude of the cluster centre
(for hyper-local use the neighbourhood centroid, NOT the city centre),
the radius in KILOMETRES, and one short reason in \`why\`.
Handle ambiguous city names by picking the largest metro and noting it.

Return one JSON object:
{
  "cities": [
    { "name": "Neighbourhood — City", "lat": 12.9716, "lng": 77.5946, "radius_km": 1.5, "why": "..." }
  ]
}`;
}

export function expectedPins(cityCount: number, scope: ReachScope) {
  return scope === "hyper-local" ? cityCount * 3 : cityCount;
}

/* ---------- Ad copy + campaign basics ---------- */

export const AGE_MIN = 18;
export const AGE_MAX = 65;
export const GENDERS = ["any", "female", "male"] as const;
export const DEVICE_OS = ["all", "android", "ios"] as const;

export type CopySuggestion = {
  campaign_name: string;
  daily_budget: number;
  primary_text: string;
  headline: string;
  description: string | null;
  call_to_action: CtaType;
  interest_targeting: string[];
  age_min: number;
  age_max: number;
  gender: (typeof GENDERS)[number];
  device_os: (typeof DEVICE_OS)[number];
  /** One line on why this audience — shown to the user. */
  audience_why: string;
  /** Ideas for carousel cards (used if the user picks Carousel). */
  carousel_cards: CardIdea[];
  /** Instant form only: short qualifying questions + thank-you text. */
  lead_questions: string[];
  thank_you_message: string;
  /** WhatsApp ads: business greeting, customer's pre-filled message, quick questions. */
  whatsapp_greeting: string;
  whatsapp_prefill: string;
  whatsapp_questions: string[];
};

export type CardIdea = { headline: string; description: string };

/** Clean model card output: non-empty, ≤40-char headlines, unique. */
export function sanitizeCards(raw: unknown, max = 10): CardIdea[] {
  const seen = new Set<string>();
  const out: CardIdea[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const o = (c ?? {}) as Record<string, unknown>;
    const headline = squash(o.headline, 40);
    if (!headline || seen.has(headline.toLowerCase())) continue;
    seen.add(headline.toLowerCase());
    out.push({ headline, description: squash(o.description, 60) });
    if (out.length >= max) break;
  }
  return out;
}

/** Carousel cards on demand (Creative → "Write cards with AI"). */
export function cardsPrompt(p: { businessName: string; about: string; offer: string; destination: Destination; objective?: string; count: number }): string {
  return `Write ${p.count} carousel cards for a Meta (Facebook + Instagram) ad.

Business: ${p.businessName || "(not provided)"}
About: ${p.about || "(not provided)"}
Offer: ${p.offer || "(not provided)"}
Goal: ${goalGuide(p.destination, p.objective)}

Each card is one swipeable panel with its own image. Make every card a DIFFERENT angle:
a specific service or product, a benefit, a proof point (experience, reviews implied by the text),
or the offer/price. Card 1 should hook; the last card should push the action.

STRICT RULES:
  • headline: MAXIMUM 32 characters, specific, no emojis, no business name unless needed.
  • description: MAXIMUM 50 characters, optional detail (price, time, place).
  • Exactly ${p.count} cards, no duplicates.

Return one JSON object:
{ "cards": [ { "headline": "...", "description": "..." } ] }`;
}

/** Sensible daily range for a local campaign, in major units. */
export const BUDGET_RANGE: Record<Currency, [number, number]> = { INR: [300, 3000], USD: [10, 100] };

/** Goal-specific writing brief: what the reader should do next. */
const GOAL_GUIDE: Record<Destination, string> = {
  lead_form: `LEADS via an instant form inside Facebook/Instagram.
  The reader should feel safe sharing their name and phone number right now.
  • Lead with the problem or outcome the reader cares about, then the offer.
  • Make the next step tiny and clear: "Tap Get quote — we'll call you back", "Takes 30 seconds".
  • Remove risk: free consultation / no obligation / reply within X hours, ONLY if implied by the offer.
  • Use urgency only if the offer has a real deadline or limit.
  • Headline = the outcome or the offer, not the business name.`,
  website: `TRAFFIC to the business website.
  The reader should want to click to learn more or see the full offer.
  • Lead with curiosity or a specific benefit that the website delivers on.
  • Tell them what they will find on the page (prices, menu, slots, catalogue).
  • Do not promise a call-back or a form — they are going to a web page.
  • Headline = the clearest reason to click.`,
  whatsapp: `CHATS on WhatsApp — tapping opens a WhatsApp chat with the business.
  • Invite a quick question: "Message us on WhatsApp for prices / availability / a free quote".
  • Promise a fast, personal reply only if plausible ("we reply within minutes").
  • Headline = what they get by messaging (quote, slot, menu, offer).`,
  messenger: `CHATS on Messenger — tapping opens a Messenger chat with the Page.
  • Invite a quick question or booking by message; keep it conversational.
  • Headline = what they get by messaging.`,
  instagram_dm: `CHATS in Instagram Direct — tapping opens a DM with the business's Instagram.
  • Casual, visual tone; invite them to DM for details, prices or booking.
  • Headline = what they get by sending a DM.`,
  call: `PHONE CALLS — tapping calls the business directly.
  • Give a reason to call now (free consultation, instant quote, book today).
  • Mention hours/availability only if given. Keep it short and local.
  • Headline = why call, e.g. "Call for a free ITR check".`,
  none: `AWARENESS — show the business to as many nearby people as possible.
  • Make the business memorable: what it is, where, and one distinctive reason to remember it.
  • No hard sell, no form or call-back promise.
  • Headline = the business's key promise or offer.`,
};

const SALES_GUIDE = `SALES on the business website (online purchase).
  • Lead with the product benefit and the price/offer; make buying feel easy and safe.
  • Mention delivery, returns or payment options only if given.
  • Headline = product + offer.`;
const WEBSITE_LEADS_GUIDE = `LEADS via a form on the business website.
  • Make filling the form feel worth it: what they get (quote, consultation, callback).
  • Headline = the outcome or the offer.`;

/** Brief for the AI given the campaign objective and destination. */
export function goalGuide(destination: Destination, objective?: string): string {
  if (destination === "website" && objective === "OUTCOME_SALES") return SALES_GUIDE;
  if (destination === "website" && objective === "OUTCOME_LEADS") return WEBSITE_LEADS_GUIDE;
  return GOAL_GUIDE[destination];
}

export function copyPrompt(p: {
  businessName: string;
  about: string;
  offer: string;
  currency: Currency;
  destination: Destination;
  objective?: string;
  ctas: readonly CtaType[];
  locationCount: number;
}): string {
  const [lo, hi] = BUDGET_RANGE[p.currency];
  return `You are setting up a Meta (Facebook + Instagram) ad campaign for a local business.

Business:
  Name: ${p.businessName || "(not provided)"}
  About: ${p.about || "(not provided)"}

Product / offer for this campaign:
  ${p.offer || "(not provided)"}

Currency: ${p.currency}
Campaign goal: ${goalGuide(p.destination, p.objective)}
Target areas: ${p.locationCount} area(s)

STRICT RULES:
  • campaign_name: short internal name, MAXIMUM 40 characters, e.g. "ITR filing — July leads".
  • daily_budget: a sensible starting DAILY budget in ${p.currency} (major units, a whole number)
    between ${lo} and ${hi}, higher when there are more target areas or a high-value service.
  • primary_text: 2–3 short sentences, MAXIMUM 400 characters, no line breaks.
  • headline: MAXIMUM 35 characters.
  • description: MAXIMUM 110 characters. Optional.
  • call_to_action: exactly one of ${p.ctas.join(", ")} — the one that best matches the goal and offer.
  • interest_targeting: exactly 3–5 relevant Meta interest names (topics people care about —
    never phone brands or device names; phone type is handled by device_os).
  • age_min / age_max: integers ${AGE_MIN}–${AGE_MAX} for the likely buyers.
  • First infer the ideal customer from the business and offer (who buys, their age, income level, lifestyle).
  • gender: exactly one of "any", "male", "female". Use "any" unless the offer is clearly for one gender.
  • device_os: exactly one of "all", "android", "ios". Default "all". Use "ios" ONLY when the business or offer
    mentions iPhone/Apple or is clearly premium / luxury / high-ticket (where iPhone users are the likely buyers);
    "android" ONLY if Android is mentioned. When unsure, "all" — never narrow the audience without a clear reason.
  • audience_why: one short sentence explaining the age, gender and phone choice.
  • lead_questions: ${p.destination === "lead_form" ? "1–3 short qualifying questions for the instant form (MAXIMUM 80 characters each) that help the business prioritise leads, e.g. \"Salaried or self-employed?\". Never ask for name, phone, email or city — those are pre-filled." : "[] (empty — not a lead form)."}
  • thank_you_message: ${p.destination === "lead_form" ? "one friendly sentence shown after the form is sent, saying what happens next (MAXIMUM 120 characters)." : "\"\""}
  • whatsapp_greeting / whatsapp_prefill / whatsapp_questions: ${p.destination === "whatsapp" ? "the WhatsApp chat that opens after tapping. whatsapp_greeting = the business's friendly first message (MAXIMUM 200 characters, mention the business name). whatsapp_prefill = what the CUSTOMER sends, written in first person about this offer (MAXIMUM 120 characters, e.g. \"Hi! I'd like a quote for ITR filing.\"). whatsapp_questions = 3 short tappable questions a customer might ask (MAXIMUM 60 characters each)." : "empty strings / empty list (not a WhatsApp ad)."}
  • carousel_cards: 4 cards for a carousel version of this ad — each a different service, benefit or
    proof point; headline MAXIMUM 32 characters, description MAXIMUM 50 characters.

OUTPUT RULES:
  • One compact JSON object, no Markdown, no emojis, no line breaks inside strings.
  • Copy must be specific to the offer — no generic filler or repetition.

{
  "campaign_name": "...",
  "daily_budget": 500,
  "primary_text": "...",
  "headline": "...",
  "description": "...",
  "call_to_action": "${p.ctas[0]}",
  "interest_targeting": ["...", "...", "..."],
  "age_min": 25,
  "age_max": 55,
  "gender": "any",
  "device_os": "all",
  "audience_why": "...",
  "carousel_cards": [{ "headline": "...", "description": "..." }],
  "lead_questions": ["..."],
  "thank_you_message": "...",
  "whatsapp_greeting": "...",
  "whatsapp_prefill": "...",
  "whatsapp_questions": ["..."]
}`;
}

const squash = (s: unknown, max: number): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  const cp = Array.from(t);
  return cp.length <= max ? t : cp.slice(0, max - 1).join("").trimEnd() + "…";
};

const int = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

/** Clamp/clean whatever the model returned into a usable suggestion. */
export function sanitizeCopy(
  raw: Record<string, unknown>,
  ctx: { currency: Currency; ctas: readonly CtaType[]; fallbackName: string },
): CopySuggestion | null {
  const primary = squash(raw.primary_text, 400);
  const headline = squash(raw.headline, 40);
  if (!primary || !headline) return null;

  const [lo, hi] = BUDGET_RANGE[ctx.currency];
  const budget = Math.min(hi, Math.max(lo, int(raw.daily_budget, CURRENCY[ctx.currency].defaultDailyBudget)));

  let ageMin = Math.min(AGE_MAX, Math.max(AGE_MIN, int(raw.age_min, 25)));
  let ageMax = Math.min(AGE_MAX, Math.max(AGE_MIN, int(raw.age_max, 55)));
  if (ageMax < ageMin) [ageMin, ageMax] = [ageMax, ageMin];

  const gender = String(raw.gender ?? "any").toLowerCase().trim();
  const cta = String(raw.call_to_action ?? "").toUpperCase().trim() as CtaType;
  const device = String(raw.device_os ?? "all").toLowerCase().trim();

  const seen = new Set<string>();
  const interests = (Array.isArray(raw.interest_targeting) ? raw.interest_targeting : [])
    .map((i) => squash(i, 60))
    .filter((i) => i && !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()))
    .slice(0, 5);

  return {
    campaign_name: squash(raw.campaign_name, 40) || ctx.fallbackName,
    daily_budget: budget,
    primary_text: primary,
    headline,
    description: squash(raw.description, 125) || null,
    call_to_action: ctx.ctas.includes(cta) ? cta : ctx.ctas[0],
    interest_targeting: interests,
    age_min: ageMin,
    age_max: ageMax,
    gender: (GENDERS as readonly string[]).includes(gender) ? (gender as CopySuggestion["gender"]) : "any",
    device_os: (DEVICE_OS as readonly string[]).includes(device) ? (device as CopySuggestion["device_os"]) : "all",
    audience_why: squash(raw.audience_why, 200),
    carousel_cards: sanitizeCards(raw.carousel_cards, 10),
    lead_questions: (Array.isArray(raw.lead_questions) ? raw.lead_questions : [])
      .map((q) => squash(q, 80))
      .filter((q) => q && !/\b(name|phone|e-?mail|city)\b/i.test(q))
      .slice(0, 3),
    thank_you_message: squash(raw.thank_you_message, 160),
    whatsapp_greeting: squash(raw.whatsapp_greeting, 300),
    whatsapp_prefill: squash(raw.whatsapp_prefill, 200),
    whatsapp_questions: (Array.isArray(raw.whatsapp_questions) ? raw.whatsapp_questions : []).map((q) => squash(q, 80)).filter(Boolean).slice(0, 4),
  };
}

/** Deterministic copy if the model fails twice — the user is never stuck. */
export function fallbackCopy(p: {
  businessName: string;
  about: string;
  offer: string;
  currency: Currency;
  ctas: readonly CtaType[];
  fallbackName: string;
}): CopySuggestion {
  const seed = (p.offer || p.about || p.businessName).trim();
  return {
    campaign_name: p.fallbackName,
    daily_budget: CURRENCY[p.currency].defaultDailyBudget,
    primary_text: squash(seed, 400) || `Learn more about ${p.businessName || "us"}.`,
    headline: squash(seed.split(".")[0], 35) || squash(p.businessName, 35) || "Find out more",
    description: squash(p.about || p.businessName, 110) || null,
    call_to_action: p.ctas[0],
    interest_targeting: [],
    age_min: 25,
    age_max: 55,
    gender: "any",
    device_os: "all",
    audience_why: "",
    carousel_cards: [],
    lead_questions: [],
    thank_you_message: "",
    whatsapp_greeting: `Hi! Thanks for contacting ${p.businessName || "us"}. How can we help?`.slice(0, 300),
    whatsapp_prefill: "Hi! I'd like to know more about your offer.",
    whatsapp_questions: [],
  };
}
