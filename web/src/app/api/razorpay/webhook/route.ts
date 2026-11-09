import { applyRemoteSubscription, enforceBilling } from "@/features/billing/access";
import type { RzpSubscription } from "@/features/billing/razorpay";
import { verifyWebhookSignature } from "@/features/billing/razorpay";
import { billingConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";

/** Razorpay → subscription.* events. Signature-checked; idempotent (always re-applies Razorpay's state). */
export async function POST(req: Request) {
  if (!billingConfigured()) return new Response("billing not configured", { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, sig)) return new Response("bad signature", { status: 401 });

  let event: { event?: string; payload?: { subscription?: { entity?: RzpSubscription } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const sub = event.payload?.subscription?.entity;
  if (!event.event?.startsWith("subscription.") || !sub?.id) return Response.json({ ignored: true });

  // Match by our stored id first; fall back to the user id we put in notes.
  const { data: row } = await db().from("subscriptions").select("user_id").eq("razorpay_subscription_id", sub.id).maybeSingle();
  const userId = row?.user_id ?? (Number(sub.notes?.user_id) || null);
  if (!userId) return Response.json({ ignored: true });
  const { data: user } = await db().from("users").select("id").eq("id", userId).maybeSingle();
  if (!user) return Response.json({ ignored: true });

  await applyRemoteSubscription(userId, sub);
  await enforceBilling(userId).catch(() => undefined);
  return Response.json({ ok: true });
}
