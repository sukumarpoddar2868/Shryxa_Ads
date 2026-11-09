import "server-only";
import { groqJson } from "@/lib/ai/groq";
import { resolvePicks } from "../geo/resolve.ts";
import type { Currency, Destination } from "../engine/presets.ts";
import type { CtaType } from "../engine/schema.ts";
import {
  cardsPrompt,
  sanitizeCards,
  type CardIdea,
  LocationGuess,
  copyPrompt,
  fallbackCopy,
  locationPrompt,
  sanitizeCopy,
  type CopySuggestion,
  type Pin,
  type ReachScope,
} from "./prompts.ts";

/**
 * City names → target areas. The AI only names places; Meta's location list
 * and OpenStreetMap supply ids and coordinates (see geo/resolve.ts).
 */
export async function resolveLocations(p: {
  cities: string[];
  businessName: string;
  about: string;
  country: string;
  countryIso: string;
  scope: ReachScope;
  token: string | null;
}): Promise<{ pins: Pin[]; notes: string[] }> {
  const prompt = locationPrompt(p);
  let picks: { area: string; city: string; state: string; why: string }[] | null = null;
  for (let attempt = 0; attempt < 2 && !picks; attempt++) {
    try {
      const parsed = LocationGuess.safeParse(JSON.parse(await groqJson(prompt, { maxTokens: 3000, temperature: 0.1 })));
      if (parsed.success) picks = parsed.data.picks;
    } catch {
      // retry
    }
  }
  // AI unavailable → still resolve the typed cities directly.
  picks ??= p.cities.map((c) => ({ area: c, city: c, state: "", why: "" }));
  const r = await resolvePicks(p.token, picks, p.scope, p.countryIso);
  if (!r.areas.length) throw new Error(r.notes[0] ?? "Couldn't find those cities. Check the spelling, or add areas on the map.");
  return { pins: r.areas.map((a) => ({ ...a, why: a.why })), notes: r.notes };
}

/** Ad copy + campaign basics. Validated, retried once, then a safe fallback. */
export async function generateCopy(p: {
  businessName: string;
  about: string;
  offer: string;
  currency: Currency;
  destination: Destination;
  objective?: string;
  ctas: readonly CtaType[];
  locationCount: number;
  fallbackName: string;
}): Promise<{ copy: CopySuggestion; fallback: boolean }> {
  const prompt = copyPrompt(p);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = JSON.parse(await groqJson(prompt, { maxTokens: 6000, temperature: 0.7 })) as Record<string, unknown>;
      const copy = sanitizeCopy(raw, p);
      if (copy) return { copy, fallback: false };
    } catch {
      // retry, then fall back
    }
  }
  return { copy: fallbackCopy(p), fallback: true };
}

/** Carousel card headlines/descriptions. Retries once; throws if nothing usable. */
export async function generateCards(p: { businessName: string; about: string; offer: string; destination: Destination; objective?: string; count: number }): Promise<CardIdea[]> {
  const prompt = cardsPrompt(p);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = JSON.parse(await groqJson(prompt, { maxTokens: 4000, temperature: 0.7 })) as { cards?: unknown };
      const cards = sanitizeCards(raw.cards, p.count);
      if (cards.length >= Math.min(2, p.count)) return cards;
    } catch {
      // retry
    }
  }
  throw new Error("The AI couldn't write the cards right now. Please try again.");
}
