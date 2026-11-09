"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { billingConfigured, billingEnv } from "@/lib/env";
import { applyRemoteSubscription, enforceBilling, getAccess } from "./access";
import { cancelSubscription, createSubscription, fetchSubscription, verifyCheckoutSignature } from "./razorpay";

export type CheckoutStart =
  | { ok: true; keyId: string; subscriptionId: string; email: string }
  | { ok: false; error: string };

/** Creates a Razorpay subscription for the Starter plan; the browser opens Checkout with it. */
export async function startCheckoutAction(): Promise<CheckoutStart> {
  const user = await requireUser();
  if (!billingConfigured()) return { ok: false, error: "Online payment isn't set up yet. Contact support to upgrade." };
  const e = billingEnv();
  const planId = user.currency === "USD" ? e.RAZORPAY_PLAN_ID_USD : e.RAZORPAY_PLAN_ID_INR;
  if (!planId) return { ok: false, error: `No ${user.currency} plan is set up yet. Contact support to upgrade.` };
  const access = await getAccess(user.id);
  if (access.state === "active" && access.allowed && access.subscriptionId) return { ok: false, error: "You already have an active plan." };
  try {
    const sub = await createSubscription(planId, { user_id: String(user.id), email: user.email, tier: "starter" });
    await applyRemoteSubscription(user.id, { ...sub, status: "created" });
    return { ok: true, keyId: e.RAZORPAY_KEY_ID, subscriptionId: sub.id, email: user.email };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't start checkout." };
  }
}

const Confirm = z.object({
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_subscription_id: z.string().min(5).max(64),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Checkout success handler: verify the signature, then trust Razorpay's own status. */
export async function confirmCheckoutAction(raw: unknown): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const p = Confirm.safeParse(raw);
  if (!p.success) return { ok: false, message: "Payment response was incomplete." };
  const { razorpay_payment_id: pay, razorpay_subscription_id: sid, razorpay_signature: sig } = p.data;
  if (!verifyCheckoutSignature(pay, sid, sig)) return { ok: false, message: "Payment signature didn't match. If you were charged, contact support." };
  const remote = await fetchSubscription(sid);
  if (remote.notes?.user_id !== String(user.id)) return { ok: false, message: "That subscription belongs to another account." };
  await applyRemoteSubscription(user.id, remote);
  const r = await enforceBilling(user.id);
  revalidatePath("/account");
  return { ok: true, message: `Payment received — your plan is active.${r.resumed ? ` ${r.resumed} paused campaign(s) turned back on.` : ""}` };
}

export async function cancelPlanAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const access = await getAccess(user.id);
  if (!access.subscriptionId || !billingConfigured()) return { ok: false, message: "There's no online subscription to cancel." };
  try {
    const remote = await cancelSubscription(access.subscriptionId, true);
    await applyRemoteSubscription(user.id, remote);
    revalidatePath("/account");
    return { ok: true, message: "Cancelled. You keep access until the end of the paid period; no further charges." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't cancel." };
  }
}
