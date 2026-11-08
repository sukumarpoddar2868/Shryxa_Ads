/**
 * Instant Form (LeadGenForm) payload. Port of `payload_pipeline/lead_form_create.py`.
 * The form must exist on the Page BEFORE the ad creative references it.
 */
import type { JsonObject } from "./builders.ts";
import type { LeadFormSpec } from "./schema.ts";

// Our prefilled-question keys → Meta question `type`.
const ALIASES: Record<string, string> = { PHONE_NUMBER: "PHONE" };

export function buildQuestions(cfg: Pick<LeadFormSpec, "prefilled_questions" | "custom_questions">): JsonObject[] {
  const out: JsonObject[] = [];
  for (const key of cfg.prefilled_questions ?? []) {
    const k = key.toUpperCase();
    out.push({ type: ALIASES[k] ?? k });
  }
  (cfg.custom_questions ?? []).forEach((q, i) => {
    const label = String(q ?? "").trim();
    if (!label) return;
    out.push({ type: "CUSTOM", label, key: `q${i + 1}` });
  });
  return out;
}

/** Body for `POST /{page_id}/leadgen_forms`. */
export function buildFormPayload(cfg: LeadFormSpec, fallbackThankYouUrl = ""): JsonObject {
  return {
    name: cfg.name,
    questions: buildQuestions(cfg),
    privacy_policy: { url: cfg.privacy_url, link_text: "Privacy Policy" },
    thank_you_page: {
      title: "Thanks!",
      body: cfg.thank_you_message ?? "We'll be in touch shortly.",
      button_text: "Visit website",
      button_type: "VIEW_WEBSITE",
      website_url: fallbackThankYouUrl || "https://example.com",
    },
    locale: cfg.locale ?? "en_US",
  };
}
