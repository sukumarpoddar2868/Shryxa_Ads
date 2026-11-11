/** Plan tiers (one login per account; tiers differ only by client limit). */
export const TIERS = {
  starter: { label: "Starter", clients: 1 },
  agency_lite: { label: "Agency Lite", clients: 5 },
  agency_standard: { label: "Agency Standard", clients: 10 },
  agency_pro: { label: "Agency Pro", clients: 25 },
} as const;
export type Tier = keyof typeof TIERS;
export const TIER_KEYS = Object.keys(TIERS) as Tier[];
export const tierLabel = (t: string) => (TIERS as Record<string, { label: string }>)[t]?.label ?? t;

export type AccessState = "trial" | "active" | "past_due" | "canceled" | "expired";
export type Access = {
  state: AccessState;
  /** May launch / turn on campaigns. */
  allowed: boolean;
  trialEndsAt: string | null;
  periodEnd: string | null;
  /** Whole days left in the trial or paid period (null when unknown). */
  daysLeft: number | null;
};

const MAP: Record<string, AccessState> = {
  active: "active",
  authenticated: "active",
  pending: "past_due",
  halted: "past_due",
  cancelled: "canceled",
  completed: "canceled",
  expired: "expired",
};
/** Razorpay subscription status → ours (null = keep current). */
export const fromRazorpay = (s: string): "active" | "past_due" | "canceled" | "expired" | null =>
  (MAP[s] as "active" | "past_due" | "canceled" | "expired" | undefined) ?? null;

/** Pure: who may spend right now. `now` passed in for testability. */
export function computeAccess(input: { status: string | null; trialEndsAt: string | null; periodEnd: string | null; isAdmin: boolean }, now: number): Access {
  const t = input.trialEndsAt ? Date.parse(input.trialEndsAt) : NaN;
  const p = input.periodEnd ? Date.parse(input.periodEnd) : NaN;
  const days = (ms: number) => (Number.isFinite(ms) ? Math.max(0, Math.ceil((ms - now) / 86_400_000)) : null);
  const base = { trialEndsAt: input.trialEndsAt, periodEnd: input.periodEnd };
  if (input.isAdmin) return { ...base, state: "active", allowed: true, daysLeft: null };
  const paidUntil = Number.isFinite(p) && p > now;
  switch (input.status) {
    case "active":
      return { ...base, state: "active", allowed: !Number.isFinite(p) || paidUntil, daysLeft: days(p) };
    case "canceled":
    case "past_due":
      // Keep what was paid for until the period ends.
      return { ...base, state: input.status, allowed: paidUntil, daysLeft: days(p) };
    case "expired":
      return { ...base, state: "expired", allowed: false, daysLeft: 0 };
    default: {
      const inTrial = Number.isFinite(t) && t > now;
      return { ...base, state: inTrial ? "trial" : "expired", allowed: inTrial, daysLeft: days(t) };
    }
  }
}
