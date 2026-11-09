"use client";

import { useState } from "react";
import { count, money, shortDate } from "./format";

/**
 * One series over time (no second axis). Spend → area + 2px line;
 * results → columns. Crosshair + tooltip on hover and keyboard (←/→),
 * and a table view underneath.
 */

type Point = { date: string; value: number };

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export function TrendChart({ title, points, kind, currency }: { title: string; points: Point[]; kind: "area" | "columns"; currency?: string | null }) {
  const [active, setActive] = useState<number | null>(null);
  const fmt = (v: number) => (currency ? money(v, currency, true) : count(v));
  // Axis ticks are whole numbers; counts step by whole units.
  const tickFmt = (v: number) => (currency ? money(Math.round(v), currency, true).replace(/\.00$/, "") : count(Math.round(v)));
  const peak = Math.max(...points.map((p) => p.value), 0);
  const countStep = Math.max(1, Math.ceil(peak / 4));
  const max = kind === "columns" && !currency ? countStep * 4 : niceMax(peak);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const step = points.length > 1 ? iw / (points.length - 1) : 0;
  const slot = iw / Math.max(points.length, 1);
  const x = (i: number) => (kind === "columns" ? PAD.left + slot * i + slot / 2 : points.length > 1 ? PAD.left + step * i : PAD.left + iw / 2);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const barW = Math.min(24, Math.max(4, slot - 6));
  const linePath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const areaPath = points.length > 1 ? `${linePath} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const total = points.reduce((s, p) => s + p.value, 0);

  const indexAt = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = kind === "columns" ? Math.floor((px - PAD.left) / slot) : Math.round((px - PAD.left) / (step || 1));
    return Math.min(points.length - 1, Math.max(0, i));
  };
  const a = active != null ? points[active] : null;

  return (
    <figure className="flex flex-col gap-2 rounded-card bg-paper p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-extrabold">{title}</span>
        <span className="text-[13px] text-ink-muted">Total {fmt(total)}</span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-lavender-deep"
          role="img"
          aria-label={`${title}: ${points.length} days, total ${fmt(total)}. Use left and right arrow keys to read each day.`}
          tabIndex={0}
          onPointerMove={(e) => setActive(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((v) => v ?? points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setActive((v) => Math.max(0, (v ?? 0) - 1));
            if (e.key === "ArrowRight") setActive((v) => Math.min(points.length - 1, (v ?? -1) + 1));
          }}
        >
          {/* recessive hairline grid + clean ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px]">
                {tickFmt(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) =>
            points[i] ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 && kind === "area" ? "start" : i === points.length - 1 && kind === "area" ? "end" : "middle"} className="fill-ink-muted text-[11px]">
                {shortDate(points[i].date)}
              </text>
            ) : null,
          )}

          {kind === "area" ? (
            <>
              {areaPath && <path d={areaPath} className="fill-lavender-deep" fillOpacity={0.1} />}
              <path d={linePath} fill="none" className="stroke-lavender-deep" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {(points.length === 1 || a) && (
                <circle cx={x(active ?? 0)} cy={y((a ?? points[0]).value)} r={4.5} className="fill-lavender-deep stroke-paper" strokeWidth={2} />
              )}
            </>
          ) : (
            points.map((p, i) => {
              const h = Math.max(0, y(0) - y(p.value));
              const r = Math.min(4, h, barW / 2);
              const x0 = x(i) - barW / 2;
              const top = y(p.value);
              // 4px rounded data-end, square at the baseline
              const d = h <= 0 ? "" : `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`;
              return d ? <path key={p.date} d={d} className="fill-lavender-deep" fillOpacity={active == null || active === i ? 1 : 0.55} /> : null;
            })
          )}

          {a && kind === "area" && <line x1={x(active!)} x2={x(active!)} y1={PAD.top} y2={y(0)} className="stroke-ink-muted" strokeWidth={1} />}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-ink-muted/40" strokeWidth={1} />
        </svg>
        {a && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-input bg-ink px-2.5 py-1.5 text-paper shadow-md"
            style={{ left: `${(x(active!) / W) * 100}%` }}
          >
            <p className="text-[14px] font-extrabold tabular-nums">{fmt(a.value)}</p>
            <p className="text-[11px] text-paper/70">{shortDate(a.date)}</p>
          </div>
        )}
      </div>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-[12px] text-ink-muted">
            <tr>
              <th className="py-1 font-bold">Date</th>
              <th className="py-1 text-right font-bold">{title}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {points.map((p) => (
              <tr key={p.date} className="border-t border-line">
                <td className="py-1">{shortDate(p.date)}</td>
                <td className="py-1 text-right">{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
