import "server-only";
import { pageAccessToken } from "@/features/meta-connect/page-token";
import { graphDelete, graphPost, MetaApiError } from "@/lib/meta/graph";
import { LEAD_FORM_REF, PLACEHOLDERS, substitute, type JsonObject, type Operation } from "./engine/builders.ts";
import { buildFormPayload } from "./engine/lead-form.ts";
import type { RunResult, RunStep } from "./engine/run-result.ts";
import { adLink, type CampaignSpec } from "./engine/schema.ts";

/**
 * Real Marketing API adapter. Port of the Python `MetaAdapter`.
 *
 *  - validate: Meta checks each payload (`execution_options=["validate_only"]`)
 *    but creates nothing. It returns no ids, so the run stops after the first
 *    step a later step depends on (the campaign).
 *  - live: creates lead form → campaign → ad set → ad. Meta isn't
 *    transactional, so on any failure everything already created is deleted
 *    in reverse order (best-effort) and the original error is reported.
 *
 * The pilot guard must be checked by the caller before this runs.
 */

/** Graph form params: nested values are sent as JSON strings. */
function toParams(payload: JsonObject): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === null) continue;
    out[k] = typeof v === "object" ? JSON.stringify(v) : v;
  }
  return out;
}

export function describeMetaError(e: unknown): string {
  if (e instanceof MetaApiError) {
    const code = e.code !== undefined ? ` (#${e.code}${e.subcode ? `/${e.subcode}` : ""})` : "";
    return `${e.userMessage || e.message}${code}`;
  }
  return e instanceof Error ? e.message : "Unknown error";
}

export async function runMeta(
  spec: CampaignSpec,
  ops: Operation[],
  token: string,
  mode: "validate" | "live",
): Promise<RunResult> {
  const validateOnly = mode === "validate";
  const result: RunResult = { mode, adAccountId: spec.ad_account_id, ok: true, steps: [], ids: {} };
  const refs: Record<string, string> = {};
  const created: { resourceType: RunStep["resourceType"]; id: string }[] = [];
  let formToken: string | null = null;

  const post = (endpoint: string, payload: JsonObject) =>
    graphPost<{ id?: string; success?: boolean }>(endpoint, token, {
      ...toParams(payload),
      ...(validateOnly ? { execution_options: JSON.stringify(["validate_only"]) } : {}),
    });

  try {
    if (spec.lead_form) {
      const oss = spec.ad.creative.object_story_spec;
      const payload = buildFormPayload(spec.lead_form, adLink(spec));
      const endpoint = `${oss.page_id}/leadgen_forms`;
      if (validateOnly) {
        // No validate_only for forms; the run stops at the campaign anyway.
        result.steps.push({ step: 0, resourceType: "lead_form", endpoint, payload, id: null });
        refs[LEAD_FORM_REF] = "VALIDATE_ONLY_PLACEHOLDER";
      } else {
        const step: RunStep = { step: 0, resourceType: "lead_form", endpoint, payload, id: null };
        result.steps.push(step);
        const res = await pageAccessToken(oss.page_id, token)
          .then((pt) => {
            formToken = pt;
            return graphPost<{ id?: string }>(endpoint, pt, toParams(payload));
          })
          .catch((e: unknown) => {
            step.error = describeMetaError(e);
            throw e;
          });
        if (!res.id) throw new Error("Meta created the lead form but returned no id.");
        step.id = res.id;
        created.push({ resourceType: "lead_form", id: res.id });
        result.ids.lead_form = res.id;
        refs[LEAD_FORM_REF] = res.id;
      }
    }

    for (const [i, op] of ops.entries()) {
      const payload = substitute(op.payload, refs);
      const step: RunStep = { step: i + 1, resourceType: op.resourceType, endpoint: op.endpoint, payload, id: null };
      result.steps.push(step);
      const res = await post(op.endpoint, payload).catch((e: unknown) => {
        step.error = describeMetaError(e);
        throw e;
      });
      step.id = res.id ?? null;

      if (res.id) {
        if (!validateOnly) created.push({ resourceType: op.resourceType, id: res.id });
        refs[PLACEHOLDERS[op.refKey]] = res.id;
        result.ids[op.resourceType] = res.id;
      } else if (validateOnly) {
        if (i < ops.length - 1) {
          result.stoppedEarly =
            "Meta accepted this step. Later steps need its real id, which validate-only mode doesn't return.";
        }
        break;
      }
    }
  } catch (e) {
    result.ok = false;
    result.error = describeMetaError(e);
    if (created.length) {
      result.cleanup = [];
      for (const r of [...created].reverse()) {
        try {
          if (r.resourceType === "lead_form") {
            // Forms can't be deleted, only archived (Page token).
            await graphPost(r.id, formToken ?? token, { status: "ARCHIVED" });
          } else {
            await graphDelete(r.id, token);
          }
          result.cleanup.push({ ...r, deleted: true });
        } catch (ce) {
          result.cleanup.push({ ...r, deleted: false, error: describeMetaError(ce) });
        }
      }
      result.ids = {};
    }
  }
  return result;
}
