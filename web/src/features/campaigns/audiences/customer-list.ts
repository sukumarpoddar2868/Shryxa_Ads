/**
 * Customer list → Meta-ready hashes, entirely in the browser (Web Crypto),
 * so raw phone numbers and emails never reach our server.
 * Meta's normalisation: email trimmed + lowercased; phone digits only with
 * country code, no leading zeros or "+". Each value SHA-256 → hex.
 */

export type CustomerRow = { email?: string; phone?: string };
export type HashedRow = [email: string, phone: string]; // "" when missing (schema ["EMAIL","PHONE"])

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function normalizePhone(raw: string, countryCode: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (raw.trim().startsWith("00")) d = d.slice(2);
  else if (raw.trim().startsWith("+")) {
    // already international
  } else if (d.length === 11 && d.startsWith("0")) d = countryCode + d.slice(1);
  else if (d.length === 10) d = countryCode + d;
  d = d.replace(/^0+/, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** One customer per line (CSV or pasted); finds an email and/or phone in each line. */
export function parseCustomerList(text: string, countryCode: string): { rows: CustomerRow[]; skipped: number } {
  const rows: CustomerRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const email = line.match(EMAIL)?.[0].trim().toLowerCase();
    const rest = email ? line.replace(email, " ") : line;
    const phoneCandidate = rest.split(/[,;\t|]/).map((x) => x.trim()).find((x) => (x.match(/\d/g)?.length ?? 0) >= 8);
    const phone = phoneCandidate ? normalizePhone(phoneCandidate, countryCode) ?? undefined : undefined;
    if (!email && !phone) {
      skipped++;
      continue;
    }
    const key = `${email ?? ""}|${phone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ email, phone });
  }
  return { rows, skipped };
}

async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashRows(rows: CustomerRow[]): Promise<HashedRow[]> {
  return Promise.all(rows.map(async (r) => [r.email ? await sha256(r.email) : "", r.phone ? await sha256(r.phone) : ""] as HashedRow));
}

export const MAX_CUSTOMERS = 50_000;
