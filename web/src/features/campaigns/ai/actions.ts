"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { aiConfigured } from "@/lib/env";
import { CTA_FOR_LEAD_FORM, CTA_FOR_WEBSITE, CURRENCIES, CURRENCY_TO_COUNTRY } from "../engine/presets.ts";
import { REACH_SCOPES, expectedPins, type CardIdea, type CopySuggestion, type Pin } from "./prompts.ts";
import { generateCards, generateCopy, resolveLocations } from "./resolver.ts";

const text = (max: number) => z.string().trim().max(max);

const SetupInput = z.object({
  clientId: z.number().int().positive(),
  objective: z.enum(["OUTCOME_LEADS", "OUTCOME_TRAFFIC"]),
  businessName: text(120).min(1, "Add the business name."),
  website: z.union([z.literal(""), z.url("Enter a full website address, starting with https://")]),
  about: text(2000).min(20, "Describe the business in a sentence or two."),
  offer: text(2000).min(10, "Say what this campaign promotes."),
  cities: z.array(text(80).min(1)).min(1, "Add at least one city.").max(10),
  scope: z.enum(REACH_SCOPES),
  currency: z.enum(CURRENCIES),
});
export type SetupInput = z.input<typeof SetupInput>;

export type SetupResult =
  | { ok: true; pins: Pin[]; copy: CopySuggestion; usedFallback: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Setup step: one call drafts the whole campaign for the user to review. */
export async function generateSetupAction(input: SetupInput): Promise<SetupResult> {
  const user = await requireUser();
  const parsed = SetupInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.objective === "OUTCOME_TRAFFIC" && !d.website) {
    return { ok: false, error: "Traffic campaigns need a website.", fieldErrors: { website: "Add the website people should visit." } };
  }
  if (!(await getClient(user.id, d.clientId))) return { ok: false, error: "Client not found." };
  if (!aiConfigured()) return { ok: false, error: "AI setup isn't configured on this server yet." };

  const destination = d.objective === "OUTCOME_TRAFFIC" ? "website" : "lead_form";
  try {
    const [pins, { copy, fallback }] = await Promise.all([
      resolveLocations({
        cities: d.cities,
        businessName: d.businessName,
        about: d.about,
        country: CURRENCY_TO_COUNTRY[d.currency],
        scope: d.scope,
      }),
      generateCopy({
        businessName: d.businessName,
        about: d.about,
        offer: d.offer,
        currency: d.currency,
        destination,
        ctas: destination === "website" ? CTA_FOR_WEBSITE : CTA_FOR_LEAD_FORM,
        locationCount: expectedPins(d.cities.length, d.scope),
        fallbackName: `${d.businessName} — ${destination === "website" ? "Traffic" : "Leads"}`.slice(0, 40),
      }),
    ]);
    return { ok: true, pins, copy, usedFallback: fallback };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI setup failed. Please try again." };
  }
}

const AreaInput = z.object({
  clientId: z.number().int().positive(),
  city: text(80).min(1),
  scope: z.enum(REACH_SCOPES),
  businessName: text(120),
  about: text(2000),
  currency: z.enum(CURRENCIES),
});

/** Audience step: add one more area (AI turns the name into pins). */
export async function resolveAreaAction(input: z.input<typeof AreaInput>): Promise<{ ok: true; pins: Pin[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = AreaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Type a city or area name." };
  const d = parsed.data;
  if (!(await getClient(user.id, d.clientId))) return { ok: false, error: "Client not found." };
  if (!aiConfigured()) return { ok: false, error: "AI setup isn't configured on this server yet." };
  try {
    const pins = await resolveLocations({
      cities: [d.city],
      businessName: d.businessName,
      about: d.about,
      country: CURRENCY_TO_COUNTRY[d.currency],
      scope: d.scope,
    });
    return { ok: true, pins };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't find that area." };
  }
}

const CardsInput = z.object({
  clientId: z.number().int().positive(),
  businessName: text(120),
  about: text(2000),
  offer: text(2000),
  destination: z.enum(["website", "lead_form"]),
  count: z.number().int().min(2).max(10),
});

/** Creative step: AI writes a headline + description for each carousel card. */
export async function generateCardsAction(input: z.input<typeof CardsInput>): Promise<{ ok: true; cards: CardIdea[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = CardsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in the business details in Start first." };
  const d = parsed.data;
  if (!d.about && !d.offer) return { ok: false, error: "Describe the business and offer in Start first." };
  if (!(await getClient(user.id, d.clientId))) return { ok: false, error: "Client not found." };
  if (!aiConfigured()) return { ok: false, error: "AI isn't configured on this server yet." };
  try {
    return { ok: true, cards: await generateCards(d) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI failed. Please try again." };
  }
}
