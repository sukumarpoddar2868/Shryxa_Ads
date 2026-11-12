import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { billingEnv } from "@/lib/env";
import { isOwnPlan } from "./plans";

/** Minimal Razorpay REST client (Basic auth). Docs: razorpay.com/docs/api/payments/subscriptions */

export type RzpSubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_end?: number | null;
  customer_id?: string | null;
  short_url?: string;
  notes?: Record<string, string>;
};
export type RzpPlan = { id: string; period: string; interval: number; item: { name: string; amount: number; currency: string } };

async function rzp<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const e = billingEnv();
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(body.error?.description ?? `Razorpay request failed (${res.status})`);
  return body;
}

export const fetchPlan = (id: string) => rzp<RzpPlan>(`plans/${id}`);
export const fetchSubscription = (id: string) => rzp<RzpSubscription>(`subscriptions/${id}`);
export const cancelSubscription = (id: string, atCycleEnd = true) =>
  rzp<RzpSubscription>(`subscriptions/${id}/cancel`, { method: "POST", body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } });

export function createSubscription(planId: string, notes: Record<string, string>) {
  return rzp<RzpSubscription>("subscriptions", {
    method: "POST",
    body: { plan_id: planId, total_count: 120, customer_notify: 1, notes },
  });
}

/** False for another Shryxa app's subscription (same Razorpay account, different plan). */
export function isOurSubscription(sub: Pick<RzpSubscription, "plan_id">): boolean {
  const e = billingEnv();
  return isOwnPlan(sub.plan_id, [e.RAZORPAY_PLAN_ID_INR, e.RAZORPAY_PLAN_ID_USD]);
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout handler signature: HMAC(payment_id|subscription_id, key_secret). */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string): boolean {
  const expected = createHmac("sha256", billingEnv().RAZORPAY_KEY_SECRET).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = billingEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
