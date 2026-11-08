import "server-only";
import { getClient } from "@/features/clients/data";
import { getConnectionToken } from "@/features/meta-connect/store";
import { metaEnv } from "@/lib/env";
import { buildAll } from "./engine/builders.ts";
import { checkPilotGuard, PilotGuardError } from "./engine/guard.ts";
import { runMock } from "./engine/mock-adapter.ts";
import { renderSpec, type RenderInput } from "./engine/render.ts";
import type { AdapterMode, RunResult } from "./engine/run-result.ts";
import { SpecValidationError, validateSpec, type CampaignSpec } from "./engine/schema.ts";
import { runMeta } from "./meta-adapter.ts";

/** Wizard answers; the client's Meta assets are filled in from the DB. */
export type LaunchInput = Omit<RenderInput, "client" | "stamp">;

export type LaunchOutcome =
  | { ok: true; spec: CampaignSpec; result: RunResult }
  | { ok: false; error: string; issues?: string[]; spec?: CampaignSpec; result?: RunResult };

/**
 * Build and run a campaign for one of the user's clients.
 *   mock     — nothing leaves the server (fake ids)
 *   validate — Meta checks the payloads, creates nothing
 *   live     — creates it (PAUSED unless launchStatus says ACTIVE)
 * Callers must have authenticated the user (requireUser) first.
 */
export async function launchCampaign(
  userId: number,
  clientId: number,
  input: LaunchInput,
  mode: AdapterMode,
): Promise<LaunchOutcome> {
  const client = await getClient(userId, clientId);
  if (!client) return { ok: false, error: "Client not found." };
  if (!client.ad_account_id || !client.page_id) {
    return { ok: false, error: "Pick this client's ad account and Facebook Page before creating a campaign." };
  }

  let spec: CampaignSpec;
  try {
    spec = validateSpec(
      renderSpec({
        ...input,
        client: {
          business_name: client.business_name?.trim() || "My business",
          ad_account_id: client.ad_account_id,
          page_id: client.page_id,
          instagram_actor_id: client.instagram_actor_id,
        },
      }),
    );
  } catch (e) {
    if (e instanceof SpecValidationError) return { ok: false, error: "Some campaign details are invalid.", issues: e.issues };
    throw e;
  }
  if (input.destination === "lead_form" && !spec.lead_form) {
    return { ok: false, error: "Lead form details are missing." };
  }

  const ops = buildAll(spec);
  if (mode === "mock") return { ok: true, spec, result: runMock(spec, ops) };

  if (!input.imageHash) return { ok: false, error: "Upload an image first.", spec };
  try {
    checkPilotGuard(ops, metaEnv().CONVERSION_TRACKING_VERIFIED);
  } catch (e) {
    if (e instanceof PilotGuardError) return { ok: false, error: e.message, spec };
    throw e;
  }

  const token = client.meta_connection_id ? await getConnectionToken(userId, client.meta_connection_id) : null;
  if (!token) return { ok: false, error: "This client's Facebook connection is missing or expired. Reconnect it.", spec };

  const result = await runMeta(spec, ops, token, mode);
  return result.ok ? { ok: true, spec, result } : { ok: false, error: result.error ?? "Meta rejected the campaign.", spec, result };
}
