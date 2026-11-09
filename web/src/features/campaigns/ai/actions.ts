"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { aiConfigured } from "@/lib/env";
import { getConnectionToken } from "@/features/meta-connect/store";
import { COUNTRY_TO_ISO, CTA_FOR, CURRENCIES, CURRENCY_TO_COUNTRY, DESTINATIONS } from "../engine/presets.ts";
import { resolveTyped } from "../geo/resolve.ts";
import { REACH_SCOPES, expectedPins, type CardIdea, type CopySuggestion, type Pin } from "./prompts.ts";
import { generateCards, generateCopy, resolveLocations } from "./resolver.ts";

const text = (max: number) => z.string().trim().max(max);
const OBJECTIVES_LIVE = ["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"] as const;

const SetupInput = z.object({
  clientId: z.number().int().positive(),
  objective: z.enum(OBJECTIVES_LIVE),
  destination: z.enum(DESTINATIONS),
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
  | { ok: true; pins: Pin[]; notes: string[]; copy: CopySuggestion; usedFallback: boolean }
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
  if (d.destination === "website" && !d.website) {
    return { ok: false, error: "This goal sends people to a website.", fieldErrors: { website: "Add the website page people should visit." } };
  }
  const client = await getClient(user.id, d.clientId);
  if (!client) return { ok: false, error: "Client not found." };
  if (!aiConfigured()) return { ok: false, error: "AI setup isn't configured on this server yet." };

  const destination = d.destination;
  const country = CURRENCY_TO_COUNTRY[d.currency];
  const token = client.meta_connection_id ? await getConnectionToken(user.id, client.meta_connection_id) : null;
  try {
    const [{ pins, notes }, { copy, fallback }] = await Promise.all([
      resolveLocations({
        cities: d.cities,
        businessName: d.businessName,
        about: d.about,
        country,
        countryIso: COUNTRY_TO_ISO[country] ?? "IN",
        scope: d.scope,
        token,
      }),
      generateCopy({
        businessName: d.businessName,
        about: d.about,
        offer: d.offer,
        currency: d.currency,
        destination,
        objective: d.objective,
        ctas: CTA_FOR[destination],
        locationCount: expectedPins(d.cities.length, d.scope),
        fallbackName: `${d.businessName} — ${d.objective.replace("OUTCOME_", "").toLowerCase()}`.slice(0, 40),
      }),
    ]);
    return { ok: true, pins, notes, copy, usedFallback: fallback };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI setup failed. Please try again." };
  }
}

const AreaInput = z.object({
  clientId: z.number().int().positive(),
  city: text(120).min(1),
  scope: z.enum(REACH_SCOPES),
  businessName: text(120),
  about: text(2000),
  currency: z.enum(CURRENCIES),
});

/** Audience step: add an area by name, "Area, City" or PIN code — direct lookup, no AI. */
export async function resolveAreaAction(input: z.input<typeof AreaInput>): Promise<{ ok: true; pins: Pin[]; notes: string[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = AreaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Type a city, \"Area, City\" or a PIN code." };
  const d = parsed.data;
  const client = await getClient(user.id, d.clientId);
  if (!client) return { ok: false, error: "Client not found." };
  const token = client.meta_connection_id ? await getConnectionToken(user.id, client.meta_connection_id) : null;
  const country = COUNTRY_TO_ISO[CURRENCY_TO_COUNTRY[d.currency]] ?? "IN";
  const r = await resolveTyped(token, d.city, d.scope, country);
  if (!r.areas.length) return { ok: false, error: r.notes[0] ?? "Couldn't find that area." };
  return { ok: true, pins: r.areas, notes: r.notes };
}

const CardsInput = z.object({
  clientId: z.number().int().positive(),
  businessName: text(120),
  about: text(2000),
  offer: text(2000),
  destination: z.enum(DESTINATIONS),
  objective: z.enum(OBJECTIVES_LIVE).optional(),
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
