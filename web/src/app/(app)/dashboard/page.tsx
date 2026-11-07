import type { Metadata } from "next";
import { Card, Chip, Callout } from "@/components/ui/surface";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/features/auth/dal";

export const metadata: Metadata = { title: "Dashboard" };

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  agency_lite: "Agency Lite",
  agency_standard: "Agency Standard",
  agency_pro: "Agency Pro",
};

// Placeholder KPIs until Phase 5 wires live Meta insights.
const kpis = [
  { label: "Spend", value: "—" },
  { label: "Impressions", value: "—" },
  { label: "Clicks", value: "—" },
  { label: "Leads", value: "—" },
];

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-8">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <p className="text-[13px] font-bold text-ink-muted">{k.label}</p>
            <p className="mt-2 text-[32px] font-extrabold tabular-nums">{k.value}</p>
          </Card>
        ))}
      </div>

      <Callout>
        <strong>Coming next:</strong> connect a client&apos;s Meta account to see live campaign data here.
      </Callout>
    </div>
  );
}
