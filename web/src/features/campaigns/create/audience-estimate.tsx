"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/cn";
import { estimateAudienceAction, type EstimateInput, type EstimateResult } from "../audiences/estimate";
import type { Draft } from "./blueprint";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

function inputFor(d: Draft): EstimateInput | null {
  if (!d.clientId || !d.objective || !d.audience.locations.length) return null;
  const a = d.audience;
  const pickedLookalike = a.type === "lookalike";
  return {
    clientId: d.clientId,
    objective: d.objective,
    destination: d.ad.destination,
    currency: d.campaign.currency,
    pins: a.locations.map((p) => ({ lat: p.lat, lng: p.lng, radiusKm: p.radiusKm })),
    ageMin: a.ageMin,
    ageMax: a.ageMax,
    gender: a.gender,
    language: a.language,
    device: a.device,
    advantage: a.mode === "advantage",
    include: a.type === "core" ? [] : a.include.filter((x) => (pickedLookalike ? x.kind === "lookalike" : x.kind !== "lookalike")).map((x) => x.id),
    exclude: a.exclude.map((x) => x.id),
    manualPlacements: d.placements.mode === "manual",
    facebook: d.placements.facebook,
    instagram: d.placements.instagram,
  };
}

/** Meta's estimated audience size for the current targeting (debounced, cached). */
export function AudienceEstimate({ draft }: { draft: Draft }) {
  const input = inputFor(draft);
  const key = input ? JSON.stringify(input) : "";
  const cache = useRef(new Map<string, EstimateResult>());
  const [state, setState] = useState<{ key: string; result: EstimateResult | null; loading: boolean }>({ key: "", result: null, loading: false });

  useEffect(() => {
    if (!key) return;
    const hit = cache.current.get(key);
    const t = setTimeout(
      async () => {
        if (hit) return setState({ key, result: hit, loading: false });
        setState((s) => ({ ...s, key, loading: true }));
        const r = await estimateAudienceAction(JSON.parse(key) as EstimateInput).catch(
          (): EstimateResult => ({ ok: false, error: "Couldn't get an estimate." }),
        );
        if (r.ok) cache.current.set(key, r);
        setState((s) => (s.key === key ? { key, result: r, loading: false } : s));
      },
      hit ? 0 : 1200,
    );
    return () => clearTimeout(t);
  }, [key]);

  if (!input) return null;
  const r = state.key === key ? state.result : null;
  const loading = state.key !== key || state.loading;

  const tone = !r?.ok ? "neutral" : r.upper < 1000 ? "bad" : r.lower < 20_000 ? "small" : "good";
  const note = !r?.ok
    ? null
    : tone === "bad"
      ? "Too narrow — Meta may barely deliver. Widen the radius, add areas, or relax age / phone / audience filters."
      : tone === "small"
        ? "Small, focused audience — fine for a local business; results may cost a bit more."
        : "Healthy size for steady delivery.";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-card px-4 py-3",
        tone === "bad" ? "bg-tomato-soft" : tone === "good" ? "bg-chartreuse-soft" : "bg-lavender-soft",
      )}
    >
      <Gauge className={cn("mt-0.5 size-5 shrink-0", tone === "bad" ? "text-tomato-700" : "text-lavender-deep")} aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">Estimated audience</p>
        {loading && !r ? (
          <p className="text-[15px] font-extrabold text-ink-muted">Asking Meta…</p>
        ) : r?.ok ? (
          <>
            <p className="text-[20px] leading-tight font-extrabold tabular-nums">
              {r.upper < 1000 ? "Below 1,000" : `${fmt(r.lower)} – ${fmt(r.upper)}`} <span className="text-[13px] font-bold text-ink-muted">people</span>
              {loading && <span className="ml-2 text-[12px] font-normal text-ink-muted">updating…</span>}
            </p>
            <p className="text-[13px]">{note}</p>
            {!r.ready && <p className="text-[12px] text-ink-muted">Some audiences are still being built, so this may grow.</p>}
          </>
        ) : (
          <p className="text-[13px] text-ink-muted">{r?.error}</p>
        )}
      </div>
    </div>
  );
}
