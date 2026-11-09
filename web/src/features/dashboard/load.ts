import "server-only";
import { listClients } from "@/features/clients/data";
import { actId, adAccountHealth, metaLinks } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphGet, graphList } from "@/lib/meta/graph";
import { addTotals, datesOf, emptyTotals, placementLabel, resultsOf, todayIn, windows, type MetaAction, type RangeKey, type Totals, type Window } from "./metrics";

/**
 * Dashboard data from Meta's Insights API (free, via each client's connection).
 * Nothing is stored. Money totals are combined only within one currency.
 */

type Row = { date_start?: string; spend?: string; impressions?: string; inline_link_clicks?: string; reach?: string; actions?: MetaAction[] };

export type Day = { date: string; spend: number; results: number };
export type ClientStat = { id: number; name: string; currency: string; now: Totals; before: Totals };
export type TopCampaign = { id: string; name: string; client: string; currency: string; spend: number; results: number; clicks: number; impressions: number; url: string };
export type Placement = { label: string; spend: number; impressions: number; results: number };
export type Alert = { level: "critical" | "warning"; client: string; text: string; href?: string };

export type DashboardData = {
  range: RangeKey;
  window: Window;
  currency: string | null;
  otherCurrencies: { currency: string; clients: string[] }[];
  now: Totals;
  before: Totals;
  daily: Day[];
  clients: ClientStat[];
  campaigns: TopCampaign[];
  placements: Placement[];
  alerts: Alert[];
  errors: { client: string; message: string }[];
  connectedClients: number;
};

const n = (v?: string) => Number(v ?? 0) || 0;
const totalsOf = (r: Row): Partial<Totals> => ({ spend: n(r.spend), impressions: n(r.impressions), clicks: n(r.inline_link_clicks), ...resultsOf(r.actions) });
const timeRange = (w: { since: string; until: string }) => JSON.stringify({ since: w.since, until: w.until });
const BASE = "spend,impressions,inline_link_clicks,actions";

type ClientResult = {
  stat: ClientStat;
  daily: Map<string, Day>;
  campaigns: TopCampaign[];
  placements: Placement[];
  alerts: Alert[];
  window: Window;
};

async function loadClient(userId: number, c: { id: number; name: string; adAccountId: string; connectionId: number }, range: RangeKey): Promise<ClientResult> {
  const token = await getConnectionToken(userId, c.connectionId);
  if (!token) throw new Error("Facebook connection expired — reconnect on the client page.");
  const act = actId(c.adAccountId);
  const acct = await graphGet<{ timezone_name?: string; currency?: string }>(act, token, { fields: "timezone_name,currency" });
  const { current, previous } = windows(range, todayIn(acct.timezone_name ?? "Asia/Kolkata", new Date()));
  const both = { since: previous.since, until: current.until };

  const [dailyRows, reachNow, reachBefore, campaignRows, placementRows, health, issues] = await Promise.all([
    graphList<Row>(`${act}/insights`, token, { fields: BASE, time_range: timeRange(both), time_increment: 1, limit: 100 }, 3),
    graphGet<{ data?: Row[] }>(`${act}/insights`, token, { fields: "reach", time_range: timeRange(current) }),
    graphGet<{ data?: Row[] }>(`${act}/insights`, token, { fields: "reach", time_range: timeRange(previous) }),
    graphList<Row & { campaign_id?: string; campaign_name?: string }>(
      `${act}/insights`,
      token,
      { level: "campaign", fields: `campaign_id,campaign_name,${BASE}`, time_range: timeRange(current), limit: 50 },
      1,
    ),
    graphList<Row & { publisher_platform?: string; platform_position?: string }>(
      `${act}/insights`,
      token,
      { fields: BASE, breakdowns: "publisher_platform,platform_position", time_range: timeRange(current), limit: 100 },
      1,
    ),
    adAccountHealth(token, c.adAccountId).catch(() => null),
    graphList<{ name?: string; effective_status?: string }>(
      `${act}/campaigns`,
      token,
      { fields: "name,effective_status", filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["WITH_ISSUES", "DISAPPROVED", "PENDING_BILLING_INFO"] }]), limit: 20 },
      1,
    ).catch(() => []),
  ]);

  const currency = acct.currency ?? health?.currency ?? "INR";
  let now = emptyTotals();
  let before = emptyTotals();
  const daily = new Map<string, Day>();
  for (const r of dailyRows) {
    const d = r.date_start ?? "";
    const t = totalsOf(r);
    if (d >= current.since) {
      now = addTotals(now, t);
      daily.set(d, { date: d, spend: t.spend ?? 0, results: t.results ?? 0 });
    } else before = addTotals(before, t);
  }
  now.reach = n(reachNow.data?.[0]?.reach);
  before.reach = n(reachBefore.data?.[0]?.reach);

  const alerts: Alert[] = [];
  const billing = metaLinks.billing(c.adAccountId);
  if (health && health.status !== 1) alerts.push({ level: "critical", client: c.name, text: `Ad account is ${health.statusLabel.toLowerCase()} — ads can't run.`, href: billing });
  else if (health && !health.hasPaymentMethod) alerts.push({ level: "critical", client: c.name, text: "No payment method on the ad account.", href: billing });
  if (health?.spendCap && health.amountSpent != null && health.amountSpent >= health.spendCap * 0.9) {
    alerts.push({ level: "warning", client: c.name, text: `Account spend limit ${Math.round((health.amountSpent / health.spendCap) * 100)}% used — ads stop at 100%.`, href: billing });
  }
  for (const x of issues) {
    const label = x.effective_status === "DISAPPROVED" ? "was rejected" : x.effective_status === "PENDING_BILLING_INFO" ? "is waiting for payment details" : "has delivery issues";
    alerts.push({ level: x.effective_status === "WITH_ISSUES" ? "warning" : "critical", client: c.name, text: `“${x.name ?? "Campaign"}” ${label}.`, href: metaLinks.adsManager(c.adAccountId) });
  }

  return {
    window: current,
    stat: { id: c.id, name: c.name, currency, now, before },
    daily,
    campaigns: campaignRows.map((r) => {
      const t = totalsOf(r);
      return {
        id: r.campaign_id ?? "",
        name: r.campaign_name ?? "Campaign",
        client: c.name,
        currency,
        spend: t.spend ?? 0,
        results: t.results ?? 0,
        clicks: t.clicks ?? 0,
        impressions: t.impressions ?? 0,
        url: `${metaLinks.adsManager(c.adAccountId)}&selected_campaign_ids=${r.campaign_id ?? ""}`,
      };
    }),
    placements: placementRows.map((r) => {
      const t = totalsOf(r);
      return { label: placementLabel(r.publisher_platform ?? "", r.platform_position ?? ""), spend: t.spend ?? 0, impressions: t.impressions ?? 0, results: t.results ?? 0 };
    }),
    alerts,
  };
}

export async function loadDashboard(userId: number, range: RangeKey, clientId: number | null): Promise<DashboardData> {
  const all = await listClients(userId);
  const connected = all
    .filter((c) => c.meta_connection_id && c.ad_account_id && (!clientId || c.id === clientId))
    .map((c) => ({ id: c.id, name: c.business_name ?? "Untitled client", adAccountId: c.ad_account_id!, connectionId: c.meta_connection_id! }));

  const settled = await Promise.allSettled(connected.map((c) => loadClient(userId, c, range)));
  const ok: ClientResult[] = [];
  const errors: DashboardData["errors"] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") ok.push(s.value);
    else errors.push({ client: connected[i].name, message: s.reason instanceof MetaApiError ? s.reason.userMessage || s.reason.message : s.reason instanceof Error ? s.reason.message : "Couldn't load data." });
  });

  // Main currency = the one with the most spend; others are listed, not summed.
  const spendBy = new Map<string, number>();
  for (const r of ok) spendBy.set(r.stat.currency, (spendBy.get(r.stat.currency) ?? 0) + r.stat.now.spend + 0.0001);
  const currency = [...spendBy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const main = ok.filter((r) => r.stat.currency === currency);

  let now = emptyTotals();
  let before = emptyTotals();
  const days = new Map<string, Day>();
  const placements = new Map<string, Placement>();
  for (const r of main) {
    now = addTotals(now, r.stat.now);
    before = addTotals(before, r.stat.before);
    for (const d of r.daily.values()) {
      const cur = days.get(d.date) ?? { date: d.date, spend: 0, results: 0 };
      days.set(d.date, { date: d.date, spend: cur.spend + d.spend, results: cur.results + d.results });
    }
    for (const p of r.placements) {
      const cur = placements.get(p.label) ?? { label: p.label, spend: 0, impressions: 0, results: 0 };
      placements.set(p.label, { label: p.label, spend: cur.spend + p.spend, impressions: cur.impressions + p.impressions, results: cur.results + p.results });
    }
  }

  const window = main[0]?.window ?? windows(range, todayIn("Asia/Kolkata", new Date())).current;
  const others = new Map<string, string[]>();
  for (const r of ok) if (r.stat.currency !== currency) others.set(r.stat.currency, [...(others.get(r.stat.currency) ?? []), r.stat.name]);

  return {
    range,
    window,
    currency,
    otherCurrencies: [...others.entries()].map(([cur, clients]) => ({ currency: cur, clients })),
    now,
    before,
    daily: datesOf(window).map((d) => days.get(d) ?? { date: d, spend: 0, results: 0 }),
    clients: ok.map((r) => r.stat).sort((a, b) => b.now.spend - a.now.spend),
    campaigns: main.flatMap((r) => r.campaigns).sort((a, b) => b.spend - a.spend).slice(0, 5),
    placements: [...placements.values()].filter((p) => p.spend > 0 || p.impressions > 0).sort((a, b) => b.spend - a.spend),
    alerts: ok.flatMap((r) => r.alerts).sort((a, b) => (a.level === b.level ? 0 : a.level === "critical" ? -1 : 1)),
    errors,
    connectedClients: connected.length,
  };
}
