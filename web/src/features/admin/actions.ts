"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/auth/dal";
import { enforceBilling } from "@/features/billing/access";
import { TIERS, TIER_KEYS } from "@/features/billing/plans";
import { db } from "@/lib/supabase/server";

const UserId = z.coerce.number().int().positive();

export async function setTierAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = UserId.parse(form.get("userId"));
  const tier = z.enum(TIER_KEYS as [string, ...string[]]).parse(form.get("tier")) as keyof typeof TIERS;
  const t = TIERS[tier];
  await db().from("users").update({ tier, client_limit: t.clients }).eq("id", id);
  revalidatePath("/admin");
}

/** Manual payment (invoice / UPI): mark active and push the paid-until date out. */
export async function extendAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = UserId.parse(form.get("userId"));
  const days = z.coerce.number().int().min(1).max(366).parse(form.get("days"));
  const { data: s } = await db().from("subscriptions").select("current_period_end").eq("user_id", id).maybeSingle();
  const from = Math.max(Date.now(), s?.current_period_end ? Date.parse(s.current_period_end) || 0 : 0);
  const end = new Date(from + days * 86_400_000).toISOString();
  const { data } = await db().from("subscriptions").update({ status: "active", current_period_end: end, provider: "manual" }).eq("user_id", id).select("user_id");
  if (!data?.length) await db().from("subscriptions").insert({ user_id: id, status: "active", current_period_end: end, provider: "manual" });
  await enforceBilling(id).catch(() => undefined);
  revalidatePath("/admin");
}

export async function extendTrialAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = UserId.parse(form.get("userId"));
  const days = z.coerce.number().int().min(1).max(60).parse(form.get("days"));
  await db().from("users").update({ trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString() }).eq("id", id);
  await db().from("subscriptions").update({ status: "trialing" }).eq("user_id", id).in("status", ["expired", "trialing"]);
  await enforceBilling(id).catch(() => undefined);
  revalidatePath("/admin");
}

export async function endAccessAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = UserId.parse(form.get("userId"));
  await db().from("subscriptions").update({ status: "expired", current_period_end: new Date().toISOString() }).eq("user_id", id);
  await db().from("users").update({ trial_ends_at: new Date().toISOString() }).eq("id", id);
  await enforceBilling(id).catch(() => undefined);
  revalidatePath("/admin");
}
