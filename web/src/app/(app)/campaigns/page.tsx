import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FilePenLine, Megaphone, Trash2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Card, Chip } from "@/components/ui/surface";
import { requireUser } from "@/features/auth/dal";
import { ensureSelfClient } from "@/features/clients/data";
import { deleteDraftAction } from "@/features/campaigns/draft-actions";
import { loadCampaignList, type CampaignListItem, type ListStatus } from "@/features/campaigns/list";
import { CampaignFilters } from "@/features/campaigns/list/filters";
import { CampaignRowActions } from "@/features/campaigns/manage/row-actions";

export const metadata: Metadata = { title: "Campaigns" };

const OBJECTIVE: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_SALES: "Sales",
  OUTCOME_APP_PROMOTION: "App",
};
const DEST: Record<string, string> = {
  lead_form: "Instant form",
  whatsapp: "WhatsApp",
  call: "Calls",
  messenger: "Messenger",
  instagram_dm: "Instagram DM",
  instagram_profile: "Instagram profile",
  website: "Website",
  none: "Reach",
};
const TONE: Record<ListStatus, "active" | "paused" | "stopped" | "neutral"> = { active: "active", paused: "paused", review: "neutral", issue: "stopped", off: "stopped" };

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: n < 100 ? 2 : 0 }).format(n);
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—");

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const user = await requireUser();
  if (user.accountType === "business") await ensureSelfClient(user);
  const isAgency = user.accountType === "agency";
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const clientFilter = Number(str("client")) || null;
  const status = str("status");
  const q = str("q").toLowerCase();
  const sort = str("sort");

  const data = await loadCampaignList(user.id);
  const byClient = <T extends { clientId: number }>(x: T) => !clientFilter || x.clientId === clientFilter;
  const byQuery = (name: string) => !q || name.toLowerCase().includes(q);

  const all = data.campaigns.filter(byClient);
  let campaigns = status === "draft" ? [] : all.filter((c) => (!status || c.status === status) && byQuery(c.name));
  if (sort === "spend") campaigns = [...campaigns].sort((a, b) => b.spend - a.spend);
  if (sort === "results") campaigns = [...campaigns].sort((a, b) => (b.results ?? -1) - (a.results ?? -1));
  const drafts = !status || status === "draft" ? data.drafts.filter(byClient).filter((d) => byQuery(d.name)) : [];
  const count = (s: ListStatus) => all.filter((c) => c.status === s).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Workspace</p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">campaigns</h1>
        </div>
        <ButtonLink href="/campaigns/new">New campaign</ButtonLink>
      </header>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <Chip tone="active">{count("active")} active</Chip>
        <Chip tone="paused">{count("paused")} paused</Chip>
        {count("review") > 0 && <Chip>{count("review")} in review</Chip>}
        {count("issue") > 0 && <Chip tone="stopped">{count("issue")} need attention</Chip>}
        <Chip>
          {data.drafts.filter(byClient).length} draft{data.drafts.filter(byClient).length === 1 ? "" : "s"}
        </Chip>
      </div>

      <CampaignFilters clients={data.clients} isAgency={isAgency} />

      {data.errors.map((e) => (
        <Callout key={e.clientName} tone="error">
          <strong>{e.clientName}:</strong> {e.message}
        </Callout>
      ))}

      {drafts.length > 0 && (
        <section aria-label="Drafts" className="flex flex-col gap-2">
          <h2 className="text-[15px] font-extrabold">Drafts</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-card bg-paper p-4">
                <FilePenLine className="size-5 shrink-0 text-lavender-deep" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{d.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {isAgency && `${d.clientName} · `}
                    {d.objective ? OBJECTIVE[d.objective] ?? d.objective : "No goal yet"}
                    {d.destination ? ` → ${DEST[d.destination] ?? d.destination}` : ""} · edited {day(d.updatedAt)}
                  </p>
                </div>
                <ButtonLink href={`/campaigns/new?draft=${d.id}`} size="sm" variant="secondary">
                  Continue
                </ButtonLink>
                <form action={deleteDraftAction.bind(null, d.id)}>
                  <button type="submit" aria-label={`Delete draft ${d.name}`} title="Delete draft" className="grid size-9 place-items-center rounded-full text-tomato-700 hover:bg-tomato-soft">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status !== "draft" &&
        (campaigns.length > 0 ? (
          <section aria-label="Campaigns" className="overflow-hidden rounded-card bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-left text-[14px]">
                <thead className="bg-lavender-soft text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    {isAgency && <th className="px-4 py-3">Client</th>}
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Budget</th>
                    <th className="px-4 py-3 text-right">Spend · 7d</th>
                    <th className="px-4 py-3 text-right">Results · 7d</th>
                    <th className="px-4 py-3 text-right">Cost / result</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {campaigns.map((c) => (
                    <Row key={c.key} c={c} isAgency={isAgency} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2 text-[12px] text-ink-muted">Live from Meta · spend and results for the last 7 days. Use ▶ / ❚❚ to turn a campaign on or pause it; ⋯ for budget, spend cap and stop.</p>
          </section>
        ) : (
          <Card className="flex flex-col items-start gap-3 p-8">
            <Megaphone className="size-6" aria-hidden strokeWidth={1.75} />
            <p className="text-[19px] font-extrabold">{all.length ? "No campaigns match these filters" : "No campaigns yet"}</p>
            <p className="max-w-md text-[15px] text-ink-muted">
              {all.length
                ? "Try another status, client or search."
                : "Create your first campaign — it launches paused, so nothing spends until you turn it on."}
            </p>
            {!all.length && (
              <Link href="/campaigns/new" className="text-[14px] font-bold text-tomato-700 hover:underline">
                Create a campaign →
              </Link>
            )}
          </Card>
        ))}
    </div>
  );
}

function Row({ c, isAgency }: { c: CampaignListItem; isAgency: boolean }) {
  return (
    <tr className="align-middle">
      <td className="max-w-[320px] px-4 py-3">
        <p className="truncate font-bold" title={c.name}>
          {c.name}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
          {OBJECTIVE[c.objective ?? ""] ?? c.objective ?? "—"}
          {c.destination && ` → ${DEST[c.destination] ?? c.destination}`} · {day(c.created)}
          {c.fromShryxa && <span className="rounded-pill bg-lavender-soft px-2 py-0.5 text-[11px] font-bold text-lavender-deep">Shryxa</span>}
        </p>
      </td>
      {isAgency && <td className="max-w-[180px] truncate px-4 py-3">{c.clientName}</td>}
      <td className="px-4 py-3">
        <Chip tone={TONE[c.status]}>{c.statusLabel}</Chip>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {c.budget ? (
          <>
            {money(c.budget.amount, c.currency)}
            <span className="block text-[11px] text-ink-muted">{c.budget.type === "daily" ? "per day" : "total"}</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{money(c.spend, c.currency)}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {c.results ?? "—"}
        {c.resultLabel && <span className="block text-[11px] text-ink-muted">{c.resultLabel}</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{c.costPerResult ? money(c.costPerResult, c.currency) : "—"}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
        <CampaignRowActions clientId={c.clientId} campaignId={c.metaId} name={c.name} configuredStatus={c.configuredStatus} currency={c.currency} budget={c.budget} spendCap={c.spendCap} />
        <a href={c.adsManagerUrl} target="_blank" rel="noreferrer" title="Open in Ads Manager" aria-label={`Open ${c.name} in Ads Manager`} className="inline-grid size-8 place-items-center rounded-full hover:bg-lavender-soft">
          <ExternalLink className="size-4" aria-hidden />
        </a>
        </div>
      </td>
    </tr>
  );
}
