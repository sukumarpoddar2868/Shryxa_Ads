import "server-only";
import { listClients } from "@/features/clients/data";
import { actId } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { billingConfigured } from "@/lib/env";
import { graphList, graphPost } from "@/lib/meta/graph";
import { db } from "@/lib/supabase/server";
import type { SubscriptionRow } from "@/lib/supabase/types";
import { computeAccess, fromRazorpay, type Access } from "./plans";
import { fetchSubscription, type RzpSubscription } from "./razorpay";

/**
 * Who may spend. Reads `users.trial_ends_at` + `subscriptions`, syncs with
 * Razorpay at most every 10 minutes (webhook keeps it fresh in between), and
 * pauses / resumes campaigns when access lapses / returns.
 */

export class PlanRequiredError extends Error {
  constructor() {
    super("Your trial or plan has ended. Choose a plan on the Account page to launch or turn on campaigns.");
    this.name = "PlanRequiredError";
  }
}

const POLL_MS = 10 * 60_000;

async function rows(userId: number) {
  const [{ data: u }, { data: s }] = await Promise.all([
    db().from("users").select("trial_ends_at, is_admin").eq("id", userId).maybeSingle(),
    db().from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  return { u, s: s as SubscriptionRow | null };
}

/** Store Razorpay's view of a subscription (from poll, checkout or webhook). */
export async function applyRemoteSubscription(userId: number, remote: RzpSubscription) {
  const status = fromRazorpay(remote.status);
  const patch: Partial<SubscriptionRow> = {
    provider: "razorpay",
    razorpay_subscription_id: remote.id,
    razorpay_customer_id: remote.customer_id ?? null,
    last_polled_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  if (remote.current_end) patch.current_period_end = new Date(remote.current_end * 1000).toISOString();
  const { data } = await db().from("subscriptions").update(patch).eq("user_id", userId).select("user_id");
  if (!data?.length) await db().from("subscriptions").insert({ user_id: userId, status: status ?? "trialing", ...patch });
}

export async function getAccess(userId: number, opts: { sync?: boolean } = {}): Promise<Access & { subscriptionId: string | null }> {
  let { u, s } = await rows(userId);
  const stale = !s?.last_polled_at || Date.now() - Date.parse(s.last_polled_at) > POLL_MS;
  if (opts.sync && s?.razorpay_subscription_id && stale && billingConfigured()) {
    try {
      await applyRemoteSubscription(userId, await fetchSubscription(s.razorpay_subscription_id));
      ({ u, s } = await rows(userId));
    } catch {
      // Razorpay down: keep the stored state.
    }
  }
  const access = computeAccess(
    { status: s?.status ?? null, trialEndsAt: u?.trial_ends_at ?? null, periodEnd: s?.current_period_end ?? null, isAdmin: Boolean(u?.is_admin) },
    Date.now(),
  );
  return { ...access, subscriptionId: s?.razorpay_subscription_id ?? null };
}

/** Throw in actions that spend money (launch live, resume). */
export async function requireActivePlan(userId: number): Promise<void> {
  if (!(await getAccess(userId, { sync: true })).allowed) throw new PlanRequiredError();
}

/* ------------------------------------------------ auto pause / resume */

type Paused = { at: string | null; ids: string[] }; // ids are "clientId:campaignId"

function readPaused(raw: string | null): Paused {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    if (Array.isArray(v)) return { at: null, ids: v.map(String) };
    const o = v as Partial<Paused>;
    return { at: o.at ?? null, ids: Array.isArray(o.ids) ? o.ids.map(String) : [] };
  } catch {
    return { at: null, ids: [] };
  }
}

async function savePaused(userId: number, p: Paused | null) {
  await db()
    .from("subscriptions")
    .update({ paused_campaign_ids: p ? JSON.stringify(p) : "[]" })
    .eq("user_id", userId);
}

async function clientTokens(userId: number) {
  const clients = await listClients(userId);
  const out: { clientId: number; act: string; token: string }[] = [];
  for (const c of clients) {
    if (!c.meta_connection_id || !c.ad_account_id) continue;
    const token = await getConnectionToken(userId, c.meta_connection_id);
    if (token) out.push({ clientId: c.id, act: actId(c.ad_account_id), token });
  }
  return out;
}

/**
 * Lapsed → pause every ACTIVE campaign once and remember which.
 * Back on a plan → resume only those (never ones the user paused).
 * Safe to call often: it does Meta work only on a transition.
 */
export async function enforceBilling(userId: number): Promise<{ paused: number; resumed: number; errors: string[] }> {
  const access = await getAccess(userId, { sync: true });
  const { s } = await rows(userId);
  if (!s) return { paused: 0, resumed: 0, errors: [] };
  const state = readPaused(s.paused_campaign_ids);
  const errors: string[] = [];

  if (!access.allowed && !state.at) {
    const ids: string[] = [];
    for (const c of await clientTokens(userId)) {
      try {
        const active = await graphList<{ id: string }>(`${c.act}/campaigns`, c.token, { fields: "id", effective_status: JSON.stringify(["ACTIVE"]) }, 5);
        for (const m of active) {
          try {
            await graphPost(m.id, c.token, { status: "PAUSED" });
            ids.push(`${c.clientId}:${m.id}`);
          } catch (e) {
            errors.push(`${m.id}: ${e instanceof Error ? e.message : "pause failed"}`);
          }
        }
      } catch (e) {
        errors.push(`${c.act}: ${e instanceof Error ? e.message : "list failed"}`);
      }
    }
    await savePaused(userId, { at: new Date().toISOString(), ids });
    return { paused: ids.length, resumed: 0, errors };
  }

  if (access.allowed && state.at) {
    const tokens = new Map((await clientTokens(userId)).map((c) => [c.clientId, c.token]));
    let resumed = 0;
    for (const key of state.ids) {
      const [cid, mid] = key.split(":");
      const token = tokens.get(Number(cid));
      if (!token || !mid) continue;
      try {
        await graphPost(mid, token, { status: "ACTIVE" });
        resumed++;
      } catch (e) {
        errors.push(`${mid}: ${e instanceof Error ? e.message : "resume failed"}`);
      }
    }
    await savePaused(userId, null);
    return { paused: 0, resumed, errors };
  }
  return { paused: 0, resumed: 0, errors };
}
