/**
 * Pilot guard: conversion objectives / goals need a working Pixel + CAPI, or
 * Meta's smart delivery optimises blind. Instant Form (ON_AD) is exempt —
 * Meta tracks those leads natively. Override with CONVERSION_TRACKING_VERIFIED.
 */
import type { Operation } from "./builders.ts";

const CONVERSION_OBJECTIVES = new Set(["OUTCOME_SALES", "OUTCOME_LEADS"]);
const CONVERSION_GOALS = new Set(["OFFSITE_CONVERSIONS", "VALUE", "LEAD_GENERATION", "QUALITY_LEAD"]);

export class PilotGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PilotGuardError";
  }
}

/** Throws PilotGuardError when the launch needs conversion tracking we don't have. */
export function checkPilotGuard(ops: Operation[], conversionTrackingVerified: boolean): void {
  if (conversionTrackingVerified) return;
  const instantForm = ops.some((o) => o.resourceType === "ad_set" && o.payload.destination_type === "ON_AD");

  for (const op of ops) {
    if (op.resourceType === "campaign") {
      const obj = String(op.payload.objective ?? "");
      if (obj === "OUTCOME_LEADS" && instantForm) continue;
      if (CONVERSION_OBJECTIVES.has(obj)) {
        throw new PilotGuardError(
          `Objective ${obj} needs Pixel + Conversions API to work well. Use Traffic, or send people to a Lead Form (Meta tracks those leads itself).`,
        );
      }
    }
    if (op.resourceType === "ad_set") {
      const goal = String(op.payload.optimization_goal ?? "");
      if ((goal === "LEAD_GENERATION" || goal === "QUALITY_LEAD") && instantForm) continue;
      if (CONVERSION_GOALS.has(goal)) {
        throw new PilotGuardError(
          `Optimisation goal ${goal} needs Pixel + Conversions API. Use Link clicks or Landing page views, or a Lead Form destination.`,
        );
      }
    }
  }
}
