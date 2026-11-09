"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { requireActivePlan } from "@/features/billing/access";
import { getClient } from "@/features/clients/data";
import { actId } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphGet, graphList, graphPost } from "@/lib/meta/graph";

/**
 * Campaign controls from the Campaigns list: pause / resume / stop, budget
 * and spend cap. Every call re-checks that the campaign belongs to the
 * client's ad account, so a forged id can't touch someone else's campaign.
 */

export type ManageResult = { ok: true; message: string } | { ok: false; error: string };

const MetaId = z.string().regex(/^\d{5,25}$/);
const ClientId = z.number().int().positive();
/** Meta's "no spend cap" value. */
const NO_CAP = "922337203685478";

type Campaign = {
  id: string;
  account_id?: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  spend_cap?: string;
};

function metaMessage(e: unknown): string {
  if (e instanceof MetaApiError) return e.userMessage || e.message;
  return e instanceof Error ? e.message : "Meta didn't accept that change.";
}

async function context(clientIdRaw: number, campaignIdRaw: string) {
  const user = await requireUser();
  const clientId = ClientId.parse(clientIdRaw);
  const campaignId = MetaId.parse(campaignIdRaw);
  const client = await getClient(user.id, clientId);
  if (!client?.ad_account_id || !client.meta_connection_id) throw new Error("This client isn't connected to Meta.");
  const token = await getConnectionToken(user.id, client.meta_connection_id);
  if (!token) throw new Error("Facebook connection expired — reconnect on the client page.");
  const c = await graphGet<Campaign>(campaignId, token, { fields: "id,account_id,status,daily_budget,lifetime_budget,spend_cap" });
  if (actId(String(c.account_id ?? "")) !== actId(client.ad_account_id)) throw new Error("That campaign isn't in this client's ad account.");
  return { user, token, campaign: c };
}

async function run(fn: () => Promise<string>): Promise<ManageResult> {
  try {
    const message = await fn();
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "That value isn't valid." };
    return { ok: false, error: metaMessage(e) };
  }
}

/** Ad sets in this campaign that are not archived/deleted. */
async function liveAdSets(token: string, campaignId: string) {
  const sets = await graphList<{ id: string; status?: string; daily_budget?: string; lifetime_budget?: string }>(
    `${campaignId}/adsets`,
    token,
    { fields: "id,status,daily_budget,lifetime_budget" },
    3,
  );
  return sets.filter((s) => s.status !== "ARCHIVED" && s.status !== "DELETED");
}

export async function setCampaignStatusAction(clientId: number, campaignId: string, action: "pause" | "resume" | "stop"): Promise<ManageResult> {
  return run(async () => {
    const { user, token, campaign } = await context(clientId, campaignId);
    if (action === "resume") {
      // Turning ads on spends money → needs a trial or paid plan.
      await requireActivePlan(user.id);
      // Shryxa launches the whole tree PAUSED, so the ad sets and ads must come on too.
      const sets = await liveAdSets(token, campaign.id);
      const ads = await graphList<{ id: string; status?: string }>(`${campaign.id}/ads`, token, { fields: "id,status" }, 3);
      await Promise.all([
        ...sets.filter((s) => s.status === "PAUSED").map((s) => graphPost(s.id, token, { status: "ACTIVE" })),
        ...ads.filter((a) => a.status === "PAUSED").map((a) => graphPost(a.id, token, { status: "ACTIVE" })),
      ]);
      await graphPost(campaign.id, token, { status: "ACTIVE" });
      return "Campaign is on. Meta may review the ads before they start delivering.";
    }
    if (action === "pause") {
      await graphPost(campaign.id, token, { status: "PAUSED" });
      return "Campaign paused.";
    }
    await graphPost(campaign.id, token, { status: "ARCHIVED" });
    return "Campaign stopped and archived. It can't be turned back on.";
  });
}

const Amount = z.number().positive().max(10_000_000);
const toMinor = (n: number) => Math.round(n * 100);

export async function updateBudgetAction(clientId: number, campaignId: string, amountRaw: number): Promise<ManageResult> {
  return run(async () => {
    const amount = Amount.parse(amountRaw);
    const { token, campaign } = await context(clientId, campaignId);
    const minor = String(toMinor(amount));
    if (Number(campaign.daily_budget) > 0) {
      await graphPost(campaign.id, token, { daily_budget: minor });
      return "Daily budget updated.";
    }
    if (Number(campaign.lifetime_budget) > 0) {
      await graphPost(campaign.id, token, { lifetime_budget: minor });
      return "Total budget updated.";
    }
    // Ad-set budgets (how Shryxa launches): one ad set → set it; several → split evenly.
    const sets = (await liveAdSets(token, campaign.id)).filter((s) => Number(s.daily_budget) > 0 || Number(s.lifetime_budget) > 0);
    if (!sets.length) throw new Error("This campaign has no budget Shryxa can edit.");
    const each = String(Math.floor(toMinor(amount) / sets.length));
    await Promise.all(sets.map((s) => graphPost(s.id, token, Number(s.daily_budget) > 0 ? { daily_budget: each } : { lifetime_budget: each })));
    return sets.length > 1 ? `Budget split across ${sets.length} ad sets.` : "Budget updated.";
  });
}

export async function updateSpendCapAction(clientId: number, campaignId: string, amountRaw: number | null): Promise<ManageResult> {
  return run(async () => {
    const { token, campaign } = await context(clientId, campaignId);
    if (amountRaw === null) {
      await graphPost(campaign.id, token, { spend_cap: NO_CAP });
      return "Spend cap removed.";
    }
    const amount = Amount.parse(amountRaw);
    await graphPost(campaign.id, token, { spend_cap: String(toMinor(amount)) });
    return "Spend cap saved. The campaign stops once it has spent this much in total.";
  });
}
