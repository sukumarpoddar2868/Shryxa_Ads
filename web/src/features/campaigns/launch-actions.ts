"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getAccess } from "@/features/billing/access";
import { getClient } from "@/features/clients/data";
import { metaLinks } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphGet } from "@/lib/meta/graph";
import { CTA_TYPES } from "./engine/schema.ts";
import { CONVERSION_EVENTS, CTA_FOR, CURRENCIES, DESTINATIONS } from "./engine/presets.ts";
import { resolveInterestIds } from "./interests";
import { launchCampaign, type LaunchInput } from "./launch";
import { pushImage, pushVideo } from "./media/push";
import { recordLaunch, removeMedia } from "./store";
import { createItemToken, itemUrl } from "./whatsapp/item-link";
import { itemMessage, waDigits, waLink } from "./whatsapp/links";

/* ---------- What the browser sends (paths only — never blobs) ---------- */

const path = z.string().min(5).max(300);
const url = z.url().max(2000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const LaunchPayload = z.object({
  clientId: z.number().int().positive(),
  objective: z.enum(["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"]),
  campaign: z.object({
    name: z.string().trim().min(1, "Add a campaign name.").max(200),
    budgetType: z.enum(["daily", "lifetime"]),
    amount: z.number().positive("Set a budget above zero.").max(10_000_000),
    currency: z.enum(CURRENCIES),
    startDate: date.optional(),
    endDate: date.optional(),
    frequencyCap: z.number().int().min(1).max(10).optional(),
  }),
  audience: z.object({
    pins: z.array(z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().min(1).max(80), geo: z.object({ kind: z.enum(["city", "neighborhood", "subcity", "zip"]), key: z.string().regex(/^[A-Za-z0-9:_-]{1,40}$/) }).nullish() })).min(1, "Add at least one area.").max(30),
    ageMin: z.number().int().min(18).max(65),
    ageMax: z.number().int().min(18).max(65),
    gender: z.enum(["any", "female", "male"]),
    language: z.string().max(40),
    advantage: z.boolean(),
    device: z.enum(["all", "android", "ios"]),
    include: z.array(z.string().regex(/^\d+$/)).max(20),
    exclude: z.array(z.string().regex(/^\d+$/)).max(20),
    interests: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
  }),
  placements: z.object({ manual: z.boolean(), facebook: z.boolean(), instagram: z.boolean() }),
  ad: z.object({
    destination: z.enum(DESTINATIONS),
    url: z.union([z.literal(""), url]),
    phone: z.string().max(30),
    whatsappNumber: z.string().max(30),
    conversionEvent: z.enum([...CONVERSION_EVENTS.OUTCOME_SALES, ...CONVERSION_EVENTS.OUTCOME_LEADS]),
    whatsapp: z.object({
      greeting: z.string().trim().max(300),
      style: z.enum(["prefill", "questions"]),
      prefill: z.string().trim().max(200),
      questions: z.array(z.string().trim().max(80)).max(4),
      perItem: z.boolean(),
    }),
    primaryText: z.string().trim().min(1, "Write the primary text.").max(2000),
    headline: z.string().trim().max(40),
    description: z.string().trim().max(125),
    cta: z.enum(CTA_TYPES),
    format: z.enum(["single", "carousel", "video"]),
    media: z.object({ feed: path.optional(), portrait: path.optional(), story: path.optional(), video: path.optional(), videoCover: path.optional() }),
    cards: z
      .array(
        z.object({
          headline: z.string().trim().min(1).max(40),
          description: z.string().max(125),
          link: z.union([z.literal(""), url]),
          imagePath: path,
          waMessage: z.string().trim().max(200).optional(),
        }),
      )
      .max(10),
    optimizeOrder: z.boolean(),
    endCard: z.boolean(),
    leadForm: z
      .object({
        name: z.string().trim().max(60),
        privacyUrl: url,
        fields: z.array(z.enum(["FULL_NAME", "PHONE_NUMBER", "EMAIL", "CITY", "POST_CODE", "STATE", "GENDER", "DOB"])).min(1),
        questions: z.array(z.string().trim().min(1).max(80)).max(5),
        thankYou: z.string().trim().max(160),
      })
      .optional(),
  }),
});
export type LaunchPayload = z.input<typeof LaunchPayload>;

export type LaunchStepView = { label: string; id: string | null; error?: string };
export type LaunchActionResult = {
  ok: boolean;
  mode: "validate" | "live";
  message: string;
  issues?: string[];
  steps: LaunchStepView[];
  campaignId?: string;
  adsManagerUrl?: string;
  cleanup?: string[];
  note?: string;
  /** Live launch went out switched on (not paused). */
  active?: boolean;
  /** A one-time account step Meta asks for, with the page that does it. */
  fix?: { title: string; body: string; url: string; label: string };
};

/** Meta errors the advertiser fixes once on Facebook (not in Shryxa). */
function knownFix(message: string | undefined): LaunchActionResult["fix"] {
  const m = (message ?? "").toLowerCase();
  if (m.includes("non-discrimination") || m.includes("nondiscrimination") || m.includes("2859002")) {
    return {
      title: "One-time step: accept Meta's Non-discrimination Policy",
      body: "Meta asks every advertiser to accept it once per ad account before ads can run. Open the page as the ad account's admin, accept, then press Launch or Pause again.",
      url: "https://www.facebook.com/certification/nondiscrimination",
      label: "Accept on Facebook",
    };
  }
  if (m.includes("payment method") || m.includes("funding source") || m.includes("billing")) {
    return {
      title: "Add a payment method to the ad account",
      body: "Meta needs a card or UPI on the ad account before ads can run. Add it in Billing, then try again.",
      url: "https://business.facebook.com/billing_hub/payment_settings/",
      label: "Open Meta billing",
    };
  }
  return undefined;
}

/** A Pixel counts as working if it fired in the last 30 days. */
async function pixelStatus(token: string, pixelId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const px = await graphGet<{ last_fired_time?: string; is_unavailable?: boolean }>(pixelId, token, { fields: "last_fired_time,is_unavailable" });
    if (px.is_unavailable) return { ok: false, message: "This Pixel is unavailable in Meta. Pick another Pixel on the client page." };
    const fired = px.last_fired_time ? Date.parse(px.last_fired_time) : NaN;
    if (!Number.isFinite(fired)) return { ok: false, message: "This Pixel has never recorded any activity. Install it on the website first, or use an instant form / WhatsApp / calls." };
    if (Date.now() - fired > 30 * 24 * 3600 * 1000) return { ok: false, message: "This Pixel hasn't recorded activity in the last 30 days. Check it's installed on the website." };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: `Couldn't check the Pixel: ${e instanceof MetaApiError ? e.userMessage || e.message : "unknown error"}` };
  }
}

const STEP_LABEL = { lead_form: "Instant form", campaign: "Campaign", ad_set: "Ad set", ad: "Ad" } as const;

function originOf(u: string) {
  try {
    return new URL(u).origin;
  } catch {
    return "";
  }
}

/** Business rules Zod can't express on its own. */
function problems(p: z.output<typeof LaunchPayload>): string[] {
  const out: string[] = [];
  if (p.audience.ageMax < p.audience.ageMin) out.push("Age 'to' must be at least age 'from'.");
  if (p.campaign.budgetType === "lifetime" && !p.campaign.endDate) out.push("A lifetime budget needs an end date.");
  if (p.campaign.startDate && p.campaign.endDate && p.campaign.endDate < p.campaign.startDate) out.push("End date must be after the start date.");
  const phone = (v: string) => /^\+[1-9]\d{7,14}$/.test(v.replace(/[^\d+]/g, ""));
  if (p.ad.destination === "website" && !p.ad.url) out.push("Add the website link people should visit.");
  if (p.ad.destination === "call" && !phone(p.ad.phone)) out.push("Add the phone number to call, with country code (e.g. +91 98765 43210).");
  if (p.ad.destination === "whatsapp") {
    if (!phone(p.ad.whatsappNumber)) out.push("Add your WhatsApp business number with country code, e.g. +91 98765 43210.");
    const w = p.ad.whatsapp;
    const perItem = p.ad.format === "carousel" && w.perItem;
    if (!perItem && !w.greeting) out.push("Write the WhatsApp greeting.");
    if (!perItem && w.style === "prefill" && !w.prefill) out.push("Write the message the customer sends on WhatsApp.");
    if (!perItem && w.style === "questions" && !w.questions.some(Boolean)) out.push("Add at least one quick question for WhatsApp.");
  }
  if (p.ad.destination === "none" && p.objective !== "OUTCOME_AWARENESS") out.push("Pick where people should go.");
  // Every button must be one Meta accepts for this destination (per-item WhatsApp links use "Contact us").
  const perItemWa = p.ad.destination === "whatsapp" && p.ad.format === "carousel" && p.ad.whatsapp.perItem;
  if (!perItemWa && !CTA_FOR[p.ad.destination].includes(p.ad.cta)) out.push("That button isn't available for this destination — pick another in Creative.");
  if (p.objective === "OUTCOME_AWARENESS" && p.ad.destination !== "none") out.push("Awareness campaigns don't use a destination.");
  if (p.ad.destination === "lead_form" && !p.ad.leadForm) out.push("Finish the instant form (privacy link + contact fields).");
  if (p.ad.format === "single" && !p.ad.media.feed) out.push("Upload the square feed image.");
  if (p.ad.format === "single" && !p.ad.headline) out.push("Write a headline.");
  if (p.ad.format === "video" && (!p.ad.media.video || !p.ad.media.videoCover)) out.push("Upload the video.");
  if (p.ad.format === "carousel" && p.ad.cards.length < 2) out.push("A carousel needs at least 2 cards, each with an image and headline.");
  if (p.placements.manual && !p.placements.facebook && !p.placements.instagram) out.push("Pick at least one placement platform.");
  return out;
}

/**
 * Review step. "validate": Meta checks the campaign without creating anything
 * (media stays local). "live": media → Meta, then lead form → campaign →
 * ad set → ad, PAUSED or ACTIVE as chosen; partial failures are rolled back.
 */
export async function launchDraftAction(
  raw: LaunchPayload,
  mode: "validate" | "live",
  draftId: number | null = null,
  statusRaw: "PAUSED" | "ACTIVE" = "PAUSED",
): Promise<LaunchActionResult> {
  const status = statusRaw === "ACTIVE" ? "ACTIVE" : "PAUSED";
  const user = await requireUser();
  const fail = (message: string, issues?: string[]): LaunchActionResult => ({ ok: false, mode, message, issues, steps: [] });

  const parsed = LaunchPayload.safeParse(raw);
  if (!parsed.success) return fail("Some campaign details need fixing.", parsed.error.issues.map((i) => i.message));
  const p = parsed.data;
  const issues = problems(p);
  if (issues.length) return fail("Some campaign details need fixing.", issues);

  if (mode === "live" && !(await getAccess(user.id, { sync: true })).allowed) {
    return fail("Your trial or plan has ended. Choose a plan on the Account page to launch campaigns.");
  }

  const client = await getClient(user.id, p.clientId);
  if (!client) return fail("Client not found.");
  if (!client.ad_account_id || !client.page_id) return fail("Pick this client's ad account and Facebook Page first.");
  const token = client.meta_connection_id ? await getConnectionToken(user.id, client.meta_connection_id) : null;
  if (!token) return fail("This client's Facebook connection is missing or expired. Reconnect it on the client page.");
  if ((p.ad.destination === "instagram_dm" || p.ad.destination === "instagram_profile") && !client.instagram_actor_id) {
    return fail("Connect this client's Instagram account first (client page → assets).");
  }

  // Website conversions: the Pixel must exist and be recording activity.
  const websiteConversions = p.ad.destination === "website" && (p.objective === "OUTCOME_SALES" || p.objective === "OUTCOME_LEADS");
  let pixelActive = false;
  if (websiteConversions) {
    if (!client.pixel_id) return fail("Connect this client's Meta Pixel first (client page → assets).");
    const status = await pixelStatus(token, client.pixel_id);
    if (!status.ok) return fail(status.message);
    pixelActive = true;
  }

  // Media: real upload only when going live (validate never gets past the campaign step).
  const target = mode === "live" ? ({ mode: "live", token, adAccountId: client.ad_account_id } as const) : ({ mode: "mock" } as const);
  const media: Partial<LaunchInput> = {};
  try {
    const m = p.ad.media;
    if (p.ad.format === "single") {
      const [feed, portrait, story] = await Promise.all([
        pushImage(user.id, m.feed!, target),
        m.portrait ? pushImage(user.id, m.portrait, target) : null,
        m.story ? pushImage(user.id, m.story, target) : null,
      ]);
      Object.assign(media, { imageHash: feed, imageHashPortrait: portrait, imageHashStory: story });
    } else if (p.ad.format === "video") {
      const [videoId, thumbnailHash] = await Promise.all([pushVideo(user.id, m.video!, target), pushImage(user.id, m.videoCover!, target)]);
      media.video = { videoId, thumbnailHash };
    } else {
      const hashes = await Promise.all(p.ad.cards.map((c) => pushImage(user.id, c.imagePath, target)));
      media.carousel = {
        cards: p.ad.cards.map((c, i) => ({ imageHash: hashes[i], headline: c.headline, description: c.description || null, link: c.link || null })),
        optimizeOrder: p.ad.optimizeOrder,
        endCard: p.ad.endCard,
      };
    }
  } catch (e) {
    const msg = e instanceof MetaApiError ? e.userMessage || e.message : e instanceof Error ? e.message : "Upload failed.";
    return fail(`Couldn't send your media to Meta: ${msg}`);
  }

  // Carousel "message about that item": each card → wa.me link with its own text + signed item link.
  const w = p.ad.whatsapp;
  const perItem = p.ad.destination === "whatsapp" && p.ad.format === "carousel" && w.perItem;
  if (perItem && media.carousel) {
    const business = client.business_name ?? "our business";
    media.carousel = {
      ...media.carousel,
      cards: media.carousel.cards.map((c, i) => {
        const card = p.ad.cards[i];
        const link = itemUrl(createItemToken({ path: card.imagePath, headline: card.headline, business, whatsapp: waDigits(p.ad.whatsappNumber) }));
        return { ...c, link: waLink(p.ad.whatsappNumber, `${itemMessage(card.waMessage ?? "", card.headline)}\n${link}`) };
      }),
    };
  }

  // AI / typed interest names → real Meta interest ids (top match each; misses are skipped).
  const interests = p.audience.interests.length ? await resolveInterestIds(token, p.audience.interests) : [];

  const lf = p.ad.leadForm;
  const landing = p.ad.url || originOf(lf?.privacyUrl ?? "");
  const input: LaunchInput = {
    currency: p.campaign.currency,
    adCopy: {
      primary_text: p.ad.primaryText,
      headline: p.ad.headline || p.ad.cards[0]?.headline || "",
      description: p.ad.description || null,
      call_to_action: p.ad.cta,
      age_min: p.audience.ageMin,
      age_max: p.audience.ageMax,
      gender: p.audience.gender,
      interest_targeting: interests,
    },
    epicenters: p.audience.pins.map((x) => ({ lat: x.lat, lng: x.lng, radius_km: x.radiusKm, geo: x.geo ?? null })),
    dailyBudget: p.campaign.amount,
    budgetType: p.campaign.budgetType,
    campaignName: p.campaign.name,
    // Per-item WhatsApp links are plain links → Traffic (Meta chat ads allow one message per ad).
    destination: perItem ? "website" : p.ad.destination,
    objective: perItem ? "OUTCOME_TRAFFIC" : p.objective,
    ctaType: perItem ? "CONTACT_US" : p.ad.cta,
    landingPageUrl: perItem ? waLink(p.ad.whatsappNumber, w.prefill || "Hi! I saw your ad.") : landing || null,
    whatsappChat:
      p.ad.destination === "whatsapp" && !perItem
        ? { greeting: w.greeting, prefill: w.style === "prefill" ? w.prefill : null, questions: w.style === "questions" ? w.questions.filter(Boolean) : [] }
        : null,
    language: p.audience.language,
    startDate: p.campaign.startDate ?? null,
    endDate: p.campaign.endDate ?? null,
    launchStatus: status,
    advantageAudience: p.audience.advantage,
    deviceOs: p.audience.device,
    audiences: p.audience.include.length || p.audience.exclude.length ? { include: p.audience.include, exclude: p.audience.exclude } : null,
    instagramUsername: client.instagram_username,
    phoneNumber: p.ad.destination === "call" ? p.ad.phone.replace(/[^\d+]/g, "") : null,
    whatsappNumber: p.ad.destination === "whatsapp" && p.ad.whatsappNumber.trim() ? p.ad.whatsappNumber.replace(/[^\d+]/g, "") : null,
    pixel: websiteConversions ? { pixelId: client.pixel_id!, event: p.ad.conversionEvent } : null,
    frequencyCap: p.objective === "OUTCOME_AWARENESS" ? (p.campaign.frequencyCap ?? 2) : null,
    publisherPlatforms: p.placements.manual
      ? ([p.placements.facebook && "facebook", p.placements.instagram && "instagram"].filter(Boolean) as ("facebook" | "instagram")[])
      : undefined,
    leadForm: lf
      ? {
          name: lf.name || `${client.business_name ?? "Lead"} enquiry`,
          privacy_url: lf.privacyUrl,
          thank_you_message: lf.thankYou || undefined,
          custom_questions: lf.questions,
          prefilled_questions: lf.fields,
        }
      : null,
    ...media,
  };

  const outcome = await launchCampaign(user.id, p.clientId, input, mode, { conversionTrackingVerified: pixelActive });
  const steps: LaunchStepView[] = (outcome.result?.steps ?? []).map((s) => ({ label: STEP_LABEL[s.resourceType], id: s.id, error: s.error }));
  const cleanup = outcome.result?.cleanup?.map((c) => `${STEP_LABEL[c.resourceType]} ${c.id}: ${c.deleted ? "deleted" : `not deleted (${c.error})`}`);

  if (!outcome.ok) return { ok: false, mode, message: outcome.error, issues: outcome.issues, steps, cleanup, fix: knownFix(outcome.error) };

  const ids = outcome.result.ids;
  if (mode === "live") {
    // Remember it in Shryxa (text only), then free Storage: Meta has its own copy of the media.
    await recordLaunch(
      user.id,
      draftId && Number.isSafeInteger(draftId) ? draftId : null,
      {
        clientId: p.clientId,
        objective: perItem ? "OUTCOME_TRAFFIC" : p.objective,
        campaign: { name: p.campaign.name, currency: p.campaign.currency, budgetType: p.campaign.budgetType, amount: p.campaign.amount },
        audience: { locations: p.audience.pins, type: p.audience.include.length ? "custom" : "core" },
        ad: { destination: perItem ? "whatsapp" : p.ad.destination, format: p.ad.format, headline: p.ad.headline, cta: p.ad.cta, carousel: { cards: p.ad.cards } },
      },
      ids,
    ).catch(() => {});
    // Per-item WhatsApp links show the card pictures from Storage — keep those.
    if (!perItem) {
      const m = p.ad.media;
      await removeMedia(user.id, [m.feed, m.portrait, m.story, m.video, m.videoCover, ...p.ad.cards.map((c) => c.imagePath)].filter(Boolean) as string[]).catch(() => {});
    }
  }
  return {
    ok: true,
    mode,
    message:
      mode === "validate"
        ? "Meta accepted the campaign settings."
        : status === "ACTIVE"
          ? "Campaign launched. Meta reviews the ad first (usually minutes, up to 24 hours); it starts spending once approved."
          : "Campaign created on Meta — paused, nothing is spending.",
    active: mode === "live" && status === "ACTIVE",
    steps,
    campaignId: ids.campaign,
    adsManagerUrl: mode === "live" ? metaLinks.adsManager(client.ad_account_id) : undefined,
    note: [outcome.result.stoppedEarly, perItem ? "Per-item WhatsApp links run as a Traffic campaign (optimised for taps)." : null].filter(Boolean).join(" ") || undefined,
  };
}
