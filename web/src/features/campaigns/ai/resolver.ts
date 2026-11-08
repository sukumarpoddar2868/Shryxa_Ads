import "server-only";
import { groqJson } from "@/lib/ai/groq";
import type { Currency, Destination } from "../engine/presets.ts";
import type { CtaType } from "../engine/schema.ts";
import {
  LocationGuess,
  copyPrompt,
  fallbackCopy,
  locationPrompt,
  sanitizeCopy,
  type CopySuggestion,
  type Pin,
  type ReachScope,
} from "./prompts.ts";

/** City names → pins (lat/lng/radius + reason). Retries once on a bad answer. */
export async function resolveLocations(p: {
  cities: string[];
  businessName: string;
  about: string;
  country: string;
  scope: ReachScope;
}): Promise<Pin[]> {
  const prompt = locationPrompt(p);
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = LocationGuess.safeParse(JSON.parse(await groqJson(prompt, { maxTokens: 4096, temperature: 0.1 })));
      if (!parsed.success) {
        lastError = "unexpected answer format";
        continue;
      }
      // A count slightly off from expectedPins() is fine — the user can edit pins.
      return parsed.data.cities;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "unknown error";
    }
  }
  throw new Error(`Couldn't work out the locations (${lastError}). Try again, or check the city names.`);
}

/** Ad copy + campaign basics. Validated, retried once, then a safe fallback. */
export async function generateCopy(p: {
  businessName: string;
  about: string;
  offer: string;
  currency: Currency;
  destination: Destination;
  ctas: readonly CtaType[];
  locationCount: number;
  idealCustomer?: string;
  fallbackName: string;
}): Promise<{ copy: CopySuggestion; fallback: boolean }> {
  const prompt = copyPrompt(p);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = JSON.parse(await groqJson(prompt, { maxTokens: 2048, temperature: 0.7 })) as Record<string, unknown>;
      const copy = sanitizeCopy(raw, p);
      if (copy) return { copy, fallback: false };
    } catch {
      // retry, then fall back
    }
  }
  return { copy: fallbackCopy(p), fallback: true };
}
