/** Pure lead helpers (no server imports) — tested in csv.test.ts. */

export type Lead = {
  id: string;
  created: string;
  fields: Record<string, string>;
  adName: string | null;
  campaignName: string | null;
  platform: string | null;
  isOrganic: boolean;
};

/** Column order: every field seen, common contact fields first. */
export function leadColumns(leads: Lead[]): string[] {
  const first = ["full_name", "first_name", "last_name", "email", "phone_number", "city"];
  const seen = new Set<string>();
  for (const l of leads) for (const k of Object.keys(l.fields)) seen.add(k);
  return [...first.filter((k) => seen.has(k)), ...[...seen].filter((k) => !first.includes(k)).sort()];
}

export const fieldLabel = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** CSV cell: quoted, and spreadsheet formulas neutralised. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function leadsCsv(leads: Lead[]): string {
  const cols = leadColumns(leads);
  const header = ["Created", ...cols.map(fieldLabel), "Campaign", "Ad", "Platform", "Organic", "Lead id"];
  const rows = leads.map((l) => [l.created, ...cols.map((c) => l.fields[c] ?? ""), l.campaignName ?? "", l.adName ?? "", l.platform ?? "", l.isOrganic ? "yes" : "no", l.id]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
