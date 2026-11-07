import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { readSessionUserId } from "./session";

/** Narrow, client-safe view of the signed-in user. */
export type CurrentUser = {
  id: number;
  email: string;
  currency: "INR" | "USD";
  tier: string;
  clientLimit: number;
  teamSeats: number;
  isAdmin: boolean;
  trialEndsAt: string | null;
};

/** Data Access Layer: the one place that resolves "who is this request?". */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;

  const { data: u } = await db()
    .from("users")
    .select("id, email, currency, tier, client_limit, team_seats, is_admin, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (!u) return null;

  return {
    id: u.id,
    email: u.email,
    currency: u.currency,
    tier: u.tier,
    clientLimit: u.client_limit,
    teamSeats: u.team_seats,
    isAdmin: Boolean(u.is_admin),
    trialEndsAt: u.trial_ends_at,
  };
});

/** Use in protected pages, layouts and every server action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}
