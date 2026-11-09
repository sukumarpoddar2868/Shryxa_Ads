import "server-only";
import { billingConfigured, billingEnv } from "@/lib/env";
import { fetchPlan } from "./razorpay";

/** Published Starter prices (also on the landing page). Razorpay's plan amount wins when configured. */
export const STARTER_PRICE = { INR: 999, USD: 21 } as const;

export async function starterPrice(currency: "INR" | "USD"): Promise<{ amount: number; currency: string; period: string }> {
  const fallback = { amount: STARTER_PRICE[currency], currency, period: "month" };
  if (!billingConfigured()) return fallback;
  const id = currency === "USD" ? billingEnv().RAZORPAY_PLAN_ID_USD : billingEnv().RAZORPAY_PLAN_ID_INR;
  if (!id) return fallback;
  try {
    const p = await fetchPlan(id);
    const period = p.interval === 1 ? p.period.replace(/ly$/, "").replace("dai", "day") : `${p.interval} ${p.period}`;
    return { amount: p.item.amount / 100, currency: p.item.currency, period };
  } catch {
    return fallback;
  }
}

export const formatPrice = (amount: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
