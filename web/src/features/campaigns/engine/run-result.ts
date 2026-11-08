import type { JsonObject, ResourceType } from "./builders.ts";

export type AdapterMode = "mock" | "validate" | "live";

export type RunStep = {
  /** 0 = lead form, 1..3 = campaign / ad set / ad. */
  step: number;
  resourceType: ResourceType | "lead_form";
  endpoint: string;
  /** Payload exactly as sent (placeholders already substituted). */
  payload: JsonObject;
  id: string | null;
  error?: string;
};

export type RunResult = {
  mode: AdapterMode;
  adAccountId: string;
  ok: boolean;
  steps: RunStep[];
  ids: Partial<Record<ResourceType | "lead_form", string>>;
  /** Validate-only stops once a later step needs an id Meta didn't return. */
  stoppedEarly?: string;
  error?: string;
  /** Rollback after a partial live failure. */
  cleanup?: { resourceType: RunStep["resourceType"]; id: string; deleted: boolean; error?: string }[];
};
