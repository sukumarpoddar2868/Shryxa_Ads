"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { RANGES, type RangeKey } from "../metrics";

/**
 * Filters (one row, date range first) + the content they scope. While new
 * data loads, the previous numbers stay on screen at reduced opacity.
 */
export function DashboardShell({ clients, isAgency, children }: { clients: { id: number; name: string }[]; isAgency: boolean; children: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const range = (params.get("range") as RangeKey | null) ?? "7d";

  const push = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    start(() => router.replace(`/dashboard${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Date range" className="inline-flex flex-wrap gap-1 rounded-pill bg-paper p-1">
          {(Object.keys(RANGES) as RangeKey[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => push("range", r === "7d" ? "" : r)}
              className={cn("rounded-pill px-3.5 py-1.5 text-[13px] font-bold", range === r ? "bg-chartreuse text-ink" : "text-ink-muted hover:text-ink")}
            >
              {RANGES[r]}
            </button>
          ))}
        </div>
        {isAgency && clients.length > 1 && (
          <Select aria-label="Client" className="h-10 bg-paper sm:w-56" value={params.get("client") ?? ""} onChange={(e) => push("client", e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        {pending && <span className="text-[12px] text-ink-muted">Updating…</span>}
      </div>
      <div aria-busy={pending} className={cn("transition-opacity", pending && "pointer-events-none opacity-50")}>
        {children}
      </div>
    </div>
  );
}
