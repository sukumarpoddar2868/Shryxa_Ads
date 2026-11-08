import "server-only";
import { graphGet } from "@/lib/meta/graph";

export type Interest = { id: string; name: string };

/**
 * Free-text interest names → real Meta interest ids (top match each).
 * Port of `meta_utils.resolve_interest_ids`. Failures are skipped, so an
 * empty result just means broad targeting — never an error.
 */
export async function resolveInterestIds(token: string, names: string[], max = 5): Promise<Interest[]> {
  const wanted = names.map((n) => String(n).trim()).filter(Boolean).slice(0, max);
  const found = await Promise.all(
    wanted.map((q) =>
      graphGet<{ data?: { id?: string; name?: string }[] }>("search", token, { type: "adinterest", q, limit: 1 })
        .then((r) => r.data?.[0])
        .catch(() => undefined),
    ),
  );
  const seen = new Set<string>();
  const out: Interest[] = [];
  found.forEach((item, i) => {
    const id = String(item?.id ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, name: item?.name ?? wanted[i] });
  });
  return out;
}
