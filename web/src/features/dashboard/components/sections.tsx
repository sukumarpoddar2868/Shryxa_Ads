import { AlertTriangle, ExternalLink, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Alert, ClientStat, Placement, TopCampaign } from "../load";
import { change, rates } from "../metrics";
import { count, money, pct } from "./format";

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-card bg-paper p-4", className)}>
      <h2 className="text-[14px] font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/** Status list — icon + label, never colour alone. */
export function Alerts({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <Panel title={`Needs attention (${alerts.length})`}>
      <ul className="flex flex-col gap-2">
        {alerts.map((a, i) => (
          <li key={i} className={cn("flex items-start gap-2.5 rounded-input px-3 py-2 text-[13px]", a.level === "critical" ? "bg-tomato-soft" : "bg-lavender-soft")}>
            {a.level === "critical" ? <OctagonAlert className="mt-0.5 size-4 shrink-0 text-tomato-700" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="font-bold">{a.level === "critical" ? "Action needed" : "Heads up"} · {a.client}:</span> {a.text}
            </span>
            {a.href && (
              <a href={a.href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-bold text-tomato-700 hover:underline">
                Fix <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Ranked horizontal bars by spend, one hue, value at the tip. */
export function Placements({ items, currency }: { items: Placement[]; currency: string | null }) {
  const top = items.slice(0, 7);
  const rest = items.slice(7);
  const rows = rest.length ? [...top, rest.reduce((o, p) => ({ ...o, spend: o.spend + p.spend, impressions: o.impressions + p.impressions, results: o.results + p.results }), { label: "Other", spend: 0, impressions: 0, results: 0 })] : top;
  const max = Math.max(...rows.map((r) => r.spend), 0.0001);
  return (
    <Panel title="Where the money went · placements">
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No placement data for this period.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-[13px]" title={`${r.label}: ${money(r.spend, currency)} · ${count(r.impressions)} impressions · ${count(r.results)} results`}>
              <span className="truncate">{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="h-3 rounded-r-[4px] bg-lavender-deep" style={{ width: `${Math.max(2, (r.spend / max) * 100)}%`, maxWidth: "calc(100% - 5.5rem)" }} />
                <span className="shrink-0 tabular-nums text-ink">{money(r.spend, currency, true)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Delta({ now, before, better }: { now: number | null; before: number | null; better: "up" | "down" }) {
  const d = change(now, before);
  if (d == null) return <span className="text-ink-muted">—</span>;
  const good = Math.abs(d) < 0.5 ? null : better === "up" ? d > 0 : d < 0;
  return (
    <span className={good === false ? "text-tomato-700" : good ? "font-bold text-ink" : "text-ink-muted"}>
      {d > 0 ? "▲" : d < 0 ? "▼" : ""} {Math.abs(d).toFixed(0)}%
    </span>
  );
}

/** Agency view: one row per client. */
export function ClientsTable({ clients }: { clients: ClientStat[] }) {
  return (
    <Panel title="By client" className="overflow-hidden">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="text-[12px] text-ink-muted">
            <tr>
              <th className="py-2 font-bold">Client</th>
              <th className="py-2 text-right font-bold">Spend</th>
              <th className="py-2 text-right font-bold">Results</th>
              <th className="py-2 text-right font-bold">Cost / result</th>
              <th className="py-2 text-right font-bold">Results vs before</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="max-w-[220px] truncate py-2 font-bold">{c.name}</td>
                <td className="py-2 text-right">{money(c.now.spend, c.currency)}</td>
                <td className="py-2 text-right">{count(c.now.results)}</td>
                <td className="py-2 text-right">{money(rates(c.now).costPerResult, c.currency)}</td>
                <td className="py-2 text-right">
                  <Delta now={c.now.results} before={c.before.results} better="up" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function TopCampaigns({ items, showClient }: { items: TopCampaign[]; showClient: boolean }) {
  return (
    <Panel title="Top campaigns by spend" className="overflow-hidden">
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No campaign spent money in this period.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[500px] text-left text-[13px]">
            <thead className="text-[12px] text-ink-muted">
              <tr>
                <th className="py-2 font-bold">Campaign</th>
                <th className="py-2 text-right font-bold">Spend</th>
                <th className="py-2 text-right font-bold">Results</th>
                <th className="py-2 text-right font-bold">Cost / result</th>
                <th className="py-2 text-right font-bold">CTR</th>
                <th className="py-2">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {items.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="max-w-[280px] py-2">
                    <span className="block truncate font-bold">{c.name}</span>
                    {showClient && <span className="block truncate text-[12px] text-ink-muted">{c.client}</span>}
                  </td>
                  <td className="py-2 text-right">{money(c.spend, c.currency)}</td>
                  <td className="py-2 text-right">{count(c.results)}</td>
                  <td className="py-2 text-right">{c.results ? money(c.spend / c.results, c.currency) : "—"}</td>
                  <td className="py-2 text-right">{pct(c.impressions ? (c.clicks / c.impressions) * 100 : null)}</td>
                  <td className="py-2 text-right">
                    <a href={c.url} target="_blank" rel="noreferrer" aria-label={`Open ${c.name} in Ads Manager`} className="inline-grid size-7 place-items-center rounded-full hover:bg-lavender-soft">
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
