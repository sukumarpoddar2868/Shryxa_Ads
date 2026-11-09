import "server-only";
import { computeAccess, type Access } from "@/features/billing/plans";
import { db } from "@/lib/supabase/server";

export type AdminUser = {
  id: number;
  email: string;
  tier: string;
  clientLimit: number;
  seats: number;
  isAdmin: boolean;
  accountType: string;
  currency: string;
  createdAt: string;
  trialEndsAt: string | null;
  periodEnd: string | null;
  provider: string | null;
  access: Access;
  clients: number;
  connected: number;
  launched: number;
};

export async function loadAdminUsers(q: string): Promise<AdminUser[]> {
  const [{ data: users }, { data: subs }, { data: clients }, { data: campaigns }] = await Promise.all([
    db().from("users").select("id, email, tier, client_limit, team_seats, is_admin, account_type, currency, created_at, trial_ends_at").order("id", { ascending: false }).limit(500),
    db().from("subscriptions").select("user_id, status, provider, current_period_end"),
    db().from("clients").select("user_id, meta_connection_id"),
    db().from("campaigns").select("user_id, state"),
  ]);
  const sub = new Map((subs ?? []).map((s) => [s.user_id, s]));
  const count = <T extends { user_id: number }>(rows: T[] | null, f: (r: T) => boolean = () => true) => {
    const m = new Map<number, number>();
    for (const r of rows ?? []) if (f(r)) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return m;
  };
  const nClients = count(clients);
  const nConnected = count(clients, (r) => Boolean(r.meta_connection_id));
  const nLaunched = count(campaigns, (r) => r.state === "launched");
  const now = Date.now();
  return (users ?? [])
    .filter((u) => !q || u.email.toLowerCase().includes(q))
    .map((u) => {
      const s = sub.get(u.id);
      return {
        id: u.id,
        email: u.email,
        tier: u.tier,
        clientLimit: u.client_limit,
        seats: u.team_seats,
        isAdmin: Boolean(u.is_admin),
        accountType: u.account_type,
        currency: u.currency,
        createdAt: u.created_at,
        trialEndsAt: u.trial_ends_at,
        periodEnd: s?.current_period_end ?? null,
        provider: s?.provider ?? null,
        access: computeAccess({ status: s?.status ?? null, trialEndsAt: u.trial_ends_at, periodEnd: s?.current_period_end ?? null, isAdmin: Boolean(u.is_admin) }, now),
        clients: nClients.get(u.id) ?? 0,
        connected: nConnected.get(u.id) ?? 0,
        launched: nLaunched.get(u.id) ?? 0,
      };
    });
}
