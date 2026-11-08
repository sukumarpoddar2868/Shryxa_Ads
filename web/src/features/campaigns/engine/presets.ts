/**
 * Currency-aware lookups and defaults. Port of the root `presets.py`
 * (demo scenarios and fake account ids left behind on purpose).
 */
import type { CtaType } from "./schema.ts";

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY: Record<
  Currency,
  {
    code: Currency;
    symbol: string;
    /** Meta stores money in minor units (paise / cents). */
    minorPerUnit: number;
    countryIso: string;
    defaultGeoCity: string;
    defaultDailyBudget: number;
    /** Campaign spend cap = daily budget × this. */
    defaultSpendCapMultiplier: number;
  }
> = {
  USD: {
    code: "USD",
    symbol: "$",
    minorPerUnit: 100,
    countryIso: "US",
    defaultGeoCity: "New York, NY",
    defaultDailyBudget: 20,
    defaultSpendCapMultiplier: 30,
  },
  INR: {
    code: "INR",
    symbol: "₹",
    minorPerUnit: 100,
    countryIso: "IN",
    defaultGeoCity: "Bangalore, Karnataka",
    defaultDailyBudget: 500,
    defaultSpendCapMultiplier: 30,
  },
};

/** Python's round(): half-to-even, so minor amounts match the legacy launcher. */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** ₹500 → 50000 paise. */
export const toMinor = (amount: number, currency: Currency) => roundHalfEven(amount * CURRENCY[currency].minorPerUnit);
export const fromMinor = (minor: number, currency: Currency) => minor / CURRENCY[currency].minorPerUnit;
export const currencySymbol = (currency: Currency) => CURRENCY[currency].symbol;

/* ---------- Geo / language / gender ---------- */

export const COUNTRY_TO_ISO: Record<string, string> = {
  "United States": "US",
  India: "IN",
  Canada: "CA",
  "United Kingdom": "GB",
};
export const CURRENCY_TO_COUNTRY: Record<Currency, string> = { USD: "United States", INR: "India" };

/** Meta locale ids for targeting.locales. */
export const LANGUAGE_TO_LOCALES: Record<string, number[]> = {
  English: [6],
  Hindi: [46],
  Spanish: [23],
  French: [9],
};

/** targeting.genders: 1 = men, 2 = women, [] = all. */
export const GENDER_TO_META = { any: [] as number[], female: [2], male: [1] } as const;
export type GenderPref = keyof typeof GENDER_TO_META;

/* ---------- Destination / CTA / bidding ---------- */

/**
 * Where people go after tapping. "none" = Awareness (no conversion location).
 * website = Traffic, or Pixel-tracked conversions under Leads/Sales.
 */
export const DESTINATIONS = ["website", "lead_form", "whatsapp", "call", "messenger", "instagram_dm", "instagram_profile", "none"] as const;
export type Destination = (typeof DESTINATIONS)[number];

/** Pixel events offered for website conversions. */
export const CONVERSION_EVENTS = {
  OUTCOME_SALES: ["PURCHASE", "INITIATED_CHECKOUT", "ADD_TO_CART"],
  OUTCOME_LEADS: ["LEAD", "COMPLETE_REGISTRATION", "CONTACT", "SCHEDULE"],
} as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[keyof typeof CONVERSION_EVENTS][number];

export const CTA_FOR_WEBSITE: CtaType[] = [
  "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "DOWNLOAD", "GET_OFFER",
  "GET_QUOTE", "CONTACT_US", "BUY_NOW", "BOOK_TRAVEL", "SUBSCRIBE",
];
// Instant-form ads accept a narrower set (no "Contact us"). BOOK_TRAVEL shows as "Book now".
export const CTA_FOR_LEAD_FORM: CtaType[] = [
  "GET_QUOTE", "SIGN_UP", "LEARN_MORE", "APPLY_NOW", "BOOK_TRAVEL",
  "GET_OFFER", "SUBSCRIBE", "DOWNLOAD",
];

/** Allowed buttons per destination (first = default). */
export const CTA_FOR: Record<Destination, CtaType[]> = {
  website: CTA_FOR_WEBSITE,
  lead_form: CTA_FOR_LEAD_FORM,
  whatsapp: ["WHATSAPP_MESSAGE"],
  call: ["CALL_NOW"],
  messenger: ["MESSAGE_PAGE"],
  instagram_dm: ["INSTAGRAM_MESSAGE"],
  instagram_profile: ["VIEW_INSTAGRAM_PROFILE"],
  none: ["LEARN_MORE", "SHOP_NOW", "CONTACT_US", "GET_OFFER", "BOOK_TRAVEL"],
};

export const BIDDING_OPTIONS = [
  { label: "Lowest cost (auto)", value: "LOWEST_COST_WITHOUT_CAP" },
  { label: "Lowest cost with bid cap", value: "LOWEST_COST_WITH_BID_CAP" },
  { label: "Cost cap", value: "COST_CAP" },
] as const;

/* ---------- Media spec (per-placement image slots) ---------- */

export const MEDIA_SLOTS = [
  { key: "feed", label: "Feed (square)", required: true, size: "1080x1080", aspect: "1:1", note: "FB Feed + IG Feed — required" },
  { key: "portrait", label: "Feed (portrait)", required: false, size: "1080x1350", aspect: "4:5", note: "IG Feed portrait — recommended" },
  { key: "story", label: "Stories / Reels", required: false, size: "1080x1920", aspect: "9:16", note: "FB Stories + IG Stories + Reels" },
] as const;

/* ---------- Business-type presets (default CTA per category) ---------- */

export type BusinessPreset = { label: string; category: string; defaultCta: CtaType };

const CUSTOM: BusinessPreset = { label: "Custom (describe below)", category: "", defaultCta: "LEARN_MORE" };

export const BUSINESS_PRESETS: Record<Currency, BusinessPreset[]> = {
  USD: [
    CUSTOM,
    { label: "E-commerce / online store", category: "Retail", defaultCta: "SHOP_NOW" },
    { label: "Local restaurant / cafe", category: "Food & Drink", defaultCta: "GET_OFFER" },
    { label: "Fitness studio / gym", category: "Fitness", defaultCta: "SIGN_UP" },
    // Python had BOOK_TRAVEL here, which reads oddly for a clinic.
    { label: "Dental / medical practice", category: "Healthcare", defaultCta: "CONTACT_US" },
  ],
  INR: [
    CUSTOM,
    { label: "Chartered Accountant / Tax consultant", category: "Professional Services", defaultCta: "GET_QUOTE" },
    { label: "Coaching / Tuition centre", category: "Education", defaultCta: "SIGN_UP" },
    { label: "Restaurant / Cloud kitchen", category: "Food & Drink", defaultCta: "GET_OFFER" },
    { label: "Salon / Wellness", category: "Beauty & Personal Care", defaultCta: "SIGN_UP" },
  ],
};
