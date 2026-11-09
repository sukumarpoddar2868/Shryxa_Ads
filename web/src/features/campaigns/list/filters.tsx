"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";

/** Campaign list filters → URL search params (server filters the list). */
export function CampaignFilters({ clients, isAgency }: { clients: { id: number; name: string }[]; isAgency: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`/campaigns${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  return (
    <form
      role="search"
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        push({ q: q.trim() });
      }}
    >
      <div className="relative sm:col-span-2 lg:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input aria-label="Search campaigns" className="h-10 bg-paper pl-9" placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => push({ q: q.trim() })} />
      </div>
      {isAgency && (
        <Select aria-label="Client" className="h-10 bg-paper lg:w-48" value={params.get("client") ?? ""} onChange={(e) => push({ client: e.target.value })}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label="Status" className="h-10 bg-paper lg:w-48" value={params.get("status") ?? ""} onChange={(e) => push({ status: e.target.value })}>
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="review">In review</option>
        <option value="issue">Needs attention</option>
        <option value="off">Archived / deleted</option>
        <option value="draft">Drafts only</option>
      </Select>
      <Select aria-label="Sort" className="h-10 bg-paper lg:w-48" value={params.get("sort") ?? ""} onChange={(e) => push({ sort: e.target.value })}>
        <option value="">Newest first</option>
        <option value="spend">Highest spend (7 days)</option>
        <option value="results">Most results (7 days)</option>
      </Select>
    </form>
  );
}
