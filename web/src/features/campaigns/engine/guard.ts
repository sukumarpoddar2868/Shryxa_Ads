/**
 * Pilot guard: website conversions (Sales, website-form Leads, OFFSITE_CONVERSIONS
 * / VALUE goals) need a working Pixel, or Meta's delivery optimises blind.
 * On-Meta destinations — instant form, WhatsApp, Messenger, Instagram DM,
 * calls — are tracked by Meta itself and always allowed.
 * `conversionTrackingVerified` = env override OR the client's Pixel is active.
 */
import type { Operation } from "./builders.ts";

const CONVERSION_OBJECTIVES = new Set(["OUTCOME_SALES", "OUTCOME_LEADS"]);
const PIXEL_GOALS = new Set(["OFFSITE_CONVERSIONS", "VALUE"]);

export class PilotGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PilotGuardError";
  }
}

export function checkPilotGuard(ops: Operation[], conversionTrackingVerified: boolean): void {
  if (conversionTrackingVerified) return;
  const adSet = ops.find((o) => o.resourceType === "ad_set");
  const destination = String(adSet?.payload.destination_type ?? "");
  const goal = String(adSet?.payload.optimization_goal ?? "");
  const objective = String(ops.find((o) => o.resourceType === "campaign")?.payload.objective ?? "");

  if (CONVERSION_OBJECTIVES.has(objective) && destination === "WEBSITE") {
    throw new PilotGuardError(
      `${objective === "OUTCOME_SALES" ? "Sales" : "Website leads"} need an active Meta Pixel on the website. Connect a Pixel that's recording visits, or use an instant form, WhatsApp or calls instead.`,
    );
  }
  if (PIXEL_GOALS.has(goal)) {
    throw new PilotGuardError(`Optimising for ${goal} needs an active Meta Pixel. Connect a Pixel that's recording visits first.`);
  }
}
