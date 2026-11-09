/** Number formatting shared by the dashboard (Indian grouping, compact above 10k). */

export function money(v: number | null, currency: string | null, compact = false): string {
  if (v == null || !currency) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: compact && Math.abs(v) >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
  }).format(v);
}

export function count(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-IN", { notation: Math.abs(v) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);
}

export const pct = (v: number | null, digits = 2) => (v == null ? "—" : `${v.toFixed(digits)}%`);

export function shortDate(ymd: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));
}
