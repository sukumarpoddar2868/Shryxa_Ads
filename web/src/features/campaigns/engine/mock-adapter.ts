/**
 * Mock adapter — no network. Port of `MockAdapter` + `MockFormAdapter`:
 * fake ids are 1_000_000_000 + step, and the lead-form id is
 * "form_" + md5(sorted JSON of the form payload)[:14], same as Python.
 */
import { createHash } from "node:crypto";
import { LEAD_FORM_REF, PLACEHOLDERS, substitute, type Operation } from "./builders.ts";
import { buildFormPayload } from "./lead-form.ts";
import { pyDumpsSorted } from "./pyjson.ts";
import type { RunResult } from "./run-result.ts";
import { adLink, type CampaignSpec } from "./schema.ts";

export function mockFormId(payload: Parameters<typeof pyDumpsSorted>[0]): string {
  return "form_" + createHash("md5").update(pyDumpsSorted(payload)).digest("hex").slice(0, 14);
}

export function runMock(spec: CampaignSpec, ops: Operation[]): RunResult {
  const result: RunResult = { mode: "mock", adAccountId: spec.ad_account_id, ok: true, steps: [], ids: {} };
  const refs: Record<string, string> = {};

  if (spec.lead_form) {
    const oss = spec.ad.creative.object_story_spec;
    const payload = buildFormPayload(spec.lead_form, adLink(spec));
    const id = mockFormId(payload);
    result.steps.push({ step: 0, resourceType: "lead_form", endpoint: `${oss.page_id}/leadgen_forms`, payload, id });
    result.ids.lead_form = id;
    refs[LEAD_FORM_REF] = id;
  }

  ops.forEach((op, i) => {
    const step = i + 1;
    const payload = substitute(op.payload, refs);
    const id = String(1_000_000_000 + step);
    refs[PLACEHOLDERS[op.refKey]] = id;
    result.ids[op.resourceType] = id;
    result.steps.push({ step, resourceType: op.resourceType, endpoint: op.endpoint, payload, id });
  });
  return result;
}
