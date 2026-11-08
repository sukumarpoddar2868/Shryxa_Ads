/**
 * Normalise an ISO-8601 datetime the way Pydantic parses it and Python's
 * `datetime.isoformat()` prints it, so the payload matches the legacy launcher:
 *   "2026-05-15T00:00:00+0000" → "2026-05-15T00:00:00+00:00"
 *   "2026-05-15T09:00Z"        → "2026-05-15T09:00:00+00:00"
 * Returns null when the string isn't a datetime.
 */
const RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

export function normalizeIsoDateTime(input: string): string | null {
  const m = RE.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss = "00", frac, tz] = m;
  const probe = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
  if (Number.isNaN(probe.getTime()) || probe.getUTCDate() !== Number(d)) return null;

  const micro = frac ? frac.padEnd(6, "0") : "";
  const fracOut = micro && Number(micro) !== 0 ? `.${micro}` : "";

  let tzOut = "";
  if (tz) {
    if (tz.toUpperCase() === "Z") tzOut = "+00:00";
    else {
      const digits = tz.slice(1).replace(":", "");
      tzOut = `${tz[0]}${digits.slice(0, 2)}:${digits.slice(2, 4).padEnd(2, "0")}`;
    }
  }
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}${fracOut}${tzOut}`;
}
