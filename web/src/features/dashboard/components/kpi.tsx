import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { change } from "../metrics";

/**
 * Stat tile: label · value · change vs the previous period (arrow + %).
 * `better` says which direction is good: up (results), down (costs) or neutral (spend).
 */
export function KpiTile({
  label,
  value,
  now,
  before,
  better,
  hint,
  spark,
}: {
  label: string;
  value: string;
  now: number | null;
  before: number | null;
  better: "up" | "down" | "neutral";
  hint?: string;
  spark?: number[];
}) {
  const d = change(now, before);
  const good = d == null || better === "neutral" || Math.abs(d) < 0.5 ? null : better === "up" ? d > 0 : d < 0;
  const Icon = d == null || Math.abs(d) < 0.5 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-col gap-1 rounded-card bg-paper p-4">
      <p className="text-[13px] font-bold text-ink-muted">{label}</p>
      <p className="text-[26px] leading-tight font-extrabold">{value}</p>
      <div className="flex min-h-5 items-center justify-between gap-2">
        {d == null ? (
          <span className="text-[12px] text-ink-muted">No earlier data</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[12px] font-bold",
              good === true ? "bg-chartreuse-soft text-ink" : good === false ? "bg-tomato-soft text-tomato-700" : "bg-lavender-soft text-ink-muted",
            )}
            title="Change vs the previous period"
          >
            <Icon className="size-3.5" aria-hidden />
            {Math.abs(d) >= 999 ? ">999" : Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%<span className="sr-only">{d > 0 ? " up" : " down"} vs previous period</span>
          </span>
        )}
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {hint && <p className="text-[12px] text-ink-muted">{hint}</p>}
    </div>
  );
}

/** 12-point-ish trend: de-emphasis line, last point in the accent. */
function Sparkline({ values }: { values: number[] }) {
  const w = 72;
  const h = 20;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 2 - (v / max) * (h - 4)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-ink-muted/50" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} className="fill-lavender-deep" />
    </svg>
  );
}
