/** Pure helpers for matching place names and checking distances. No server imports. */

/** "Indira Nagar" == "indiranagar" == "Indiranagar,". */
export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Exact match after normalising ("Indiranagar" = "Indira Nagar"), or whole-word
 * prefix ("Andheri" ↔ "Andheri East"). "Saket" ≠ "Saketri Village".
 */
export function nameMatches(wanted: string, found: string): "exact" | "prefix" | null {
  const a = normName(wanted);
  const b = normName(found);
  if (!a || !b) return null;
  if (a === b) return "exact";
  const [x, y] = [words(wanted), words(found)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length && short.length < long.length && short.every((w, i) => w === long[i])) return "prefix";
  return null;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "Koramangala — Bangalore" / "Koramangala, Bangalore" → { area, city }. */
export function splitArea(name: string): { area: string; city: string | null } {
  const parts = name.split(/\s+[—–-]\s+|,\s*/).map((x) => x.trim()).filter(Boolean);
  return parts.length >= 2 ? { area: parts[0], city: parts[1] } : { area: parts[0] ?? name.trim(), city: null };
}

/** Common Indian place-name endings Meta often writes as a separate word ("Indira Nagar"). */
const SUFFIXES = ["nagar", "puram", "pur", "palya", "halli", "abad", "ganj", "pet", "pura", "layout", "colony", "vihar", "bagh", "garh"];

/** Search spellings to try: as typed, plus "Indiranagar" → "Indira Nagar". */
export function spellings(name: string): string[] {
  const out = [name.trim()];
  const lower = name.trim().toLowerCase();
  if (!/\s/.test(lower)) {
    for (const suf of SUFFIXES) {
      if (lower.endsWith(suf) && lower.length > suf.length + 2) {
        const head = name.trim().slice(0, -suf.length);
        out.push(`${head} ${suf[0].toUpperCase()}${suf.slice(1)}`);
        break;
      }
    }
  }
  return out;
}
