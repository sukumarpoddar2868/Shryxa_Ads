import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/surface";
import { requireUser } from "@/features/auth/dal";
import { listClients } from "@/features/clients/data";
import { count, money, pct, shortDate } from "@/features/dashboard/components/format";
import { KpiTile } from "@/features/dashboard/components/kpi";
import { Alerts, ClientsTable, Placements, TopCampaigns } from "@/features/dashboard/components/sections";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { TrendChart } from "@/features/dashboard/components/trend-chart";
import { loadDashboard } from "@/features/dashboard/load";
import { isRange, rates, windows, type RangeKey } from "@/features/dashboard/metrics";

export const metadata: Metadata = { title: "Dashboard" };

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  agency_lite: "Agency Lite",
  agency_standard: "Agency Standard",
  agency_pro: "Agency Pro",
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const user = await requireUser();
  const rangeParam = typeof sp.range === "string" ? sp.range : "7d";
  const range = isRange(rangeParam) ? rangeParam : "7d";
  const clientId = typeof sp.client === "string" ? Number(sp.client) || null : null;
  const isAgency = user.accountType === "agency";
  const clients = (await listClients(user.id)).filter((c) => c.meta_connection_id).map((c) => ({ id: c.id, name: c.business_name ?? "Untitled client" }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Overview</p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <Chip tone="active">{TIER_LABELS[user.tier] ?? user.tier}</Chip>
          <ButtonLink href="/campaigns/new">New campaign</ButtonLink>
        </div>
      </header>

      {clients.length === 0 ? (
        <Callout>
          <strong>Next step:</strong> {isAgency ? "add a client and connect their Facebook" : "connect your Facebook"} to see live campaign data here.{" "}
          <Link href="/clients" className="font-bold text-tomato-700 hover:underline">
            {isAgency ? "Go to clients" : "Connect Facebook"} →
          </Link>
        </Callout>
      ) : (
        <DashboardShell clients={clients} isAgency={isAgency}>
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardContent userId={user.id} range={range} clientId={clientId} isAgency={isAgency} />
          </Suspense>
        </DashboardShell>
      )}
    </div>
  );
}

async function DashboardContent({ userId, range, clientId, isAgency }: { userId: number; range: RangeKey; clientId: number | null; isAgency: boolean }) {
  const d = await loadDashboard(userId, range, clientId);
  const cur = d.currency;
  const r = rates(d.now);
  const rb = rates(d.before);
  const prev = windows(d.range, d.window.until).previous;
  const parts = [
    [d.now.leads, "leads"],
    [d.now.chats, "chats"],
    [d.now.calls, "calls"],
    [d.now.purchases, "purchases"],
  ]
    .filter(([v]) => (v as number) > 0)
    .map(([v, l]) => `${count(v as number)} ${l}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-ink-muted">
        {shortDate(d.window.since)}
        {d.window.days > 1 ? ` – ${shortDate(d.window.until)}` : ""} · compared with {shortDate(prev.since)}
        {prev.days > 1 ? ` – ${shortDate(prev.until)}` : ""} · live from Meta
      </p>

      {d.errors.map((e) => (
        <Callout key={e.client} tone="error">
          <strong>{e.client}:</strong> {e.message}
        </Callout>
      ))}
      {d.otherCurrencies.map((o) => (
        <Callout key={o.currency}>
          Totals are in {cur}. {o.clients.join(", ")} {o.clients.length === 1 ? "uses" : "use"} {o.currency} — pick {o.clients.length === 1 ? "it" : "one"} in the client filter to see {o.clients.length === 1 ? "its" : "their"} numbers.
        </Callout>
      ))}

      <Alerts alerts={d.alerts} />

      {/* Headline KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Spend" value={money(d.now.spend, cur)} now={d.now.spend} before={d.before.spend} better="neutral" spark={d.daily.map((x) => x.spend)} />
        <KpiTile label="Results" value={count(d.now.results)} now={d.now.results} before={d.before.results} better="up" hint={parts || "Leads, chats, calls and purchases"} spark={d.daily.map((x) => x.results)} />
        <KpiTile label="Cost per result" value={money(r.costPerResult, cur)} now={r.costPerResult} before={rb.costPerResult} better="down" />
        <KpiTile label="Reach" value={count(d.now.reach)} now={d.now.reach} before={d.before.reach} better="up" hint="People who saw your ads" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Impressions" value={count(d.now.impressions)} now={d.now.impressions} before={d.before.impressions} better="up" />
        <KpiTile label="Link clicks" value={count(d.now.clicks)} now={d.now.clicks} before={d.before.clicks} better="up" />
        <KpiTile label="CTR" value={pct(r.ctr)} now={r.ctr} before={rb.ctr} better="up" />
        <KpiTile label="CPM" value={money(r.cpm, cur)} now={r.cpm} before={rb.cpm} better="down" />
        <KpiTile label="CPC" value={money(r.cpc, cur)} now={r.cpc} before={rb.cpc} better="down" />
        <KpiTile label="Frequency" value={r.frequency ? r.frequency.toFixed(2) : "—"} now={r.frequency} before={rb.frequency} better="down" hint="Avg. times each person saw an ad" />
      </div>

      {/* Two measures, two charts — never a shared axis */}
      <div className="grid gap-3 lg:grid-cols-2">
        <TrendChart title="Spend per day" points={d.daily.map((x) => ({ date: x.date, value: x.spend }))} kind="area" currency={cur} />
        <TrendChart title="Results per day" points={d.daily.map((x) => ({ date: x.date, value: x.results }))} kind="columns" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Placements items={d.placements} currency={cur} />
        <TopCampaigns items={d.campaigns} showClient={isAgency && !clientId && d.clients.length > 1} />
      </div>

      {isAgency && !clientId && d.clients.length > 1 && <ClientsTable clients={d.clients} />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy className="flex animate-pulse flex-col gap-3">
      <div className="h-4 w-64 rounded-card bg-paper" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-card bg-paper" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-64 rounded-card bg-paper" />
        <div className="h-64 rounded-card bg-paper" />
      </div>
    </div>
  );
}
