import "server-only";
import { metaEnv } from "@/lib/env";
import { graphGet } from "@/lib/meta/graph";
import type { GeoRef } from "../engine/render.ts";
import { distanceKm, nameMatches, spellings } from "./match.ts";

/**
 * Place names → target areas. Meta location ids first (exact areas Meta
 * draws itself), OpenStreetMap (Photon) as fallback for a pin. Every match
 * is checked: same name, same region, close to the town. Nothing is guessed.
 */

export type Area = {
  name: string;
  lat: number;
  lng: number;
  /** For pins: the circle. For city ids: 0 = the city itself, 17–80 = city + radius. Display-only for neighbourhoods/PINs. */
  radius_km: number;
  why: string;
  geo: GeoRef | null;
};

export type Scope = "hyper-local" | "local" | "city-wide" | "metro";

type MetaPlace = { key: string; name: string; type: string; region?: string; region_id?: number; primary_city?: string };
type MetaMeta = { name: string; city?: string; region?: string; latitude?: string; longitude?: string };
type OsmPlace = { name: string; lat: number; lng: number; state: string | null; city: string | null; country: string | null; kind: string };

/* ---------------------------------------------------------- sources */

async function metaSearch(token: string, q: string, types: string[], country: string): Promise<MetaPlace[]> {
  const r = await graphGet<{ data?: MetaPlace[] }>("search", token, {
    type: "adgeolocation",
    q,
    location_types: JSON.stringify(types),
    country_code: country,
    limit: 25,
  }).catch(() => ({ data: [] }));
  return r.data ?? [];
}

async function metaDetails(token: string, kind: "neighborhoods" | "subcities", keys: string[]): Promise<Record<string, MetaMeta>> {
  if (!keys.length) return {};
  const r = await graphGet<{ data?: Record<string, Record<string, MetaMeta>> }>("search", token, {
    type: "adgeolocationmeta",
    [kind]: JSON.stringify(keys),
  }).catch(() => ({ data: undefined }));
  return r.data?.[kind] ?? {};
}

async function photon(q: string, country: string, near?: { lat: number; lng: number }): Promise<OsmPlace[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `ShryxaAds/1.0 (${metaEnv().APP_URL})` },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
    };
    return (body.features ?? [])
      .filter((f) => (f.properties.countrycode ?? "").toUpperCase() === country)
      .map((f) => ({
        name: f.properties.name ?? "",
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        state: f.properties.state ?? null,
        city: f.properties.city ?? f.properties.county ?? null,
        country: f.properties.country ?? null,
        kind: `${f.properties.osm_key}:${f.properties.osm_value}`,
      }));
  } catch {
    return [];
  }
}

const sameRegion = (a?: string | null, b?: string | null) => !a || !b || nameMatches(a, b) === "exact";
const TOWN_KINDS = /^(place:(city|town|village|municipality)|boundary:administrative)$/;
const AREA_KINDS = /^place:(suburb|neighbourhood|quarter|locality|village|hamlet|city_block|borough)$/;

/* ---------------------------------------------------------- towns */

type Town = { name: string; region: string | null; lat: number; lng: number; key: string | null };

/** A town or city: Meta city id when Meta has it, centre from OpenStreetMap. */
export async function findTown(token: string | null, town: string, state: string | null, country: string): Promise<Town | null> {
  const osm = (await photon(state ? `${town}, ${state}` : town, country)).filter(
    (p) => nameMatches(town, p.name) && sameRegion(state, p.state),
  );
  const centre = osm.find((p) => TOWN_KINDS.test(p.kind)) ?? osm[0] ?? null;

  let meta: MetaPlace | null = null;
  if (token) {
    const found = (await metaSearch(token, town, ["city"], country)).filter((m) => nameMatches(town, m.name) === "exact");
    meta = found.find((m) => sameRegion(state ?? centre?.state, m.region)) ?? null;
  }
  if (!centre && !meta) return null;
  if (!centre) return null; // need a centre to check neighbourhood distances and show the map
  return { name: meta?.name ?? centre.name, region: meta?.region ?? centre.state, lat: centre.lat, lng: centre.lng, key: meta?.key ?? null };
}

/* ---------------------------------------------------------- neighbourhoods */

const MAX_KM_FROM_TOWN = 25;

/** A neighbourhood inside a known town: Meta neighbourhood id, else an OSM pin, else null. */
export async function findLocality(token: string | null, area: string, town: Town, country: string): Promise<Area | null> {
  if (token) {
    const lists = await Promise.all(spellings(area).map((q) => metaSearch(token, q, ["neighborhood", "subcity"], country)));
    const hits = [...new Map(lists.flat().map((m) => [m.key, m])).values()].filter((m) => nameMatches(area, m.name));
    const byKind = (t: string) => hits.filter((h) => h.type === t).map((h) => h.key);
    const [nb, sc] = await Promise.all([metaDetails(token, "neighborhoods", byKind("neighborhood")), metaDetails(token, "subcities", byKind("subcity"))]);
    const candidates = hits
      .map((h) => {
        const m = (h.type === "neighborhood" ? nb : sc)[h.key];
        const lat = Number(m?.latitude);
        const lng = Number(m?.longitude);
        if (!m || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
        return { h, lat, lng, km: distanceKm(town, { lat, lng }) };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.km <= MAX_KM_FROM_TOWN && sameRegion(town.region, c.h.region))
      // Exact name beats "Andheri East"-style prefix; then nearest to town.
      .sort((a, b) => Number(nameMatches(area, b.h.name) === "exact") - Number(nameMatches(area, a.h.name) === "exact") || a.km - b.km);
    const best = candidates[0];
    if (best) {
      return {
        name: `${best.h.name} — ${town.name}`,
        lat: best.lat,
        lng: best.lng,
        radius_km: 1.5,
        why: "",
        geo: { kind: best.h.type === "subcity" ? "subcity" : "neighborhood", key: best.h.key },
      };
    }
  }
  // Map fallback: only real areas (suburb / neighbourhood / locality), never roads, shops or bus stops.
  const osm = (await photon(`${area}, ${town.name}`, country, town))
    .filter((p) => AREA_KINDS.test(p.kind) && nameMatches(area, p.name) && distanceKm(town, p) <= MAX_KM_FROM_TOWN)
    .sort((a, b) => Number(nameMatches(area, b.name) === "exact") - Number(nameMatches(area, a.name) === "exact") || distanceKm(town, a) - distanceKm(town, b))[0];
  if (!osm) return null;
  return { name: `${osm.name} — ${town.name}`, lat: osm.lat, lng: osm.lng, radius_km: 1.5, why: "", geo: null };
}

/* ---------------------------------------------------------- PIN codes */

export async function findZip(token: string | null, code: string, country: string): Promise<Area | null> {
  if (!token) return null;
  const hit = (await metaSearch(token, code, ["zip"], country)).find((m) => m.name === code);
  if (!hit) return null;
  const town = hit.primary_city ? await findTown(token, hit.primary_city, hit.region ?? null, country) : null;
  if (!town) return null;
  return { name: `PIN ${code} — ${hit.primary_city}`, lat: town.lat, lng: town.lng, radius_km: 3, why: "", geo: { kind: "zip", key: hit.key } };
}

/* ---------------------------------------------------------- whole towns by scope */

/** Town-level area for a scope: Meta city id (city only / + radius) or an OSM pin. */
export function townArea(town: Town, scope: Scope): Area {
  const radius = { "hyper-local": 0, local: 0, "city-wide": 17, metro: 40 }[scope];
  if (town.key) {
    return { name: `${town.name}${town.region ? `, ${town.region}` : ""}`, lat: town.lat, lng: town.lng, radius_km: radius || 5, why: "", geo: { kind: "city", key: town.key } };
  }
  const pinRadius = { "hyper-local": 5, local: 8, "city-wide": 20, metro: 40 }[scope];
  return { name: `${town.name}${town.region ? `, ${town.region}` : ""}`, lat: town.lat, lng: town.lng, radius_km: pinRadius, why: "", geo: null };
}

/* ---------------------------------------------------------- orchestration */

export type Resolved = { areas: Area[]; notes: string[] };

/**
 * AI picks (names) → areas. Hyper-local uses Meta neighbourhood ids; a town
 * where Meta has none is targeted as a whole (small towns aren't split up).
 */
export async function resolvePicks(
  token: string | null,
  picks: { area: string; city: string; state: string; why: string }[],
  scope: Scope,
  country: string,
): Promise<Resolved> {
  const notes: string[] = [];
  const areas: Area[] = [];
  const byTown = new Map<string, typeof picks>();
  for (const p of picks) {
    const k = `${p.city.toLowerCase()}|${p.state.toLowerCase()}`;
    byTown.set(k, [...(byTown.get(k) ?? []), p]);
  }

  await Promise.all(
    [...byTown.values()].map(async (group) => {
      const { city, state } = group[0];
      const town = await findTown(token, city, state || null, country);
      if (!town) {
        notes.push(`Couldn't find "${city}" — add it on the map.`);
        return;
      }
      const whyTown = group.find((g) => nameMatches(g.area, city))?.why ?? group[0].why;
      if (scope !== "hyper-local") {
        areas.push({ ...townArea(town, scope), why: whyTown });
        return;
      }
      const localities = group.filter((g) => !nameMatches(g.area, city));
      const found = (await Promise.all(localities.map(async (g) => ({ g, a: await findLocality(token, g.area, town, country) })))).filter((x) => x.a);
      const fromMeta = found.filter((x) => x.a!.geo);
      // Small towns: Meta has no neighbourhoods → target the whole town, not guessed spots.
      if (!fromMeta.length) {
        areas.push({ ...townArea(town, "local"), why: whyTown });
        if (localities.length) notes.push(`${town.name}: ${localities.map((l) => l.area).join(", ")} isn’t on Meta’s area list — targeting the whole town instead.`);
        return;
      }
      for (const { g, a } of found) areas.push({ ...a!, why: g.why });
      const missed = localities.filter((l) => !found.some((f) => f.g === l)).map((l) => l.area);
      if (missed.length) notes.push(`Couldn't find ${missed.join(", ")} in ${town.name} — add them on the map if needed.`);
    }),
  );
  // Same Meta id twice (two names for one area) → keep one.
  const seen = new Set<string>();
  return {
    areas: areas.filter((a) => {
      const k = a.geo ? `${a.geo.kind}:${a.geo.key}` : `${a.lat.toFixed(3)},${a.lng.toFixed(3)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    notes,
  };
}

/**
 * What a person typed in "Add area": a PIN code, "Area, City", or a town.
 * No AI — direct lookup.
 */
export async function resolveTyped(token: string | null, text: string, scope: Scope, country: string): Promise<Resolved> {
  const q = text.trim();
  if (/^\d{6}$/.test(q) && country === "IN") {
    const zip = await findZip(token, q, country);
    return zip ? { areas: [{ ...zip, why: "Added by PIN code" }], notes: [] } : { areas: [], notes: [`PIN code ${q} isn't on Meta's list.`] };
  }
  const parts = q.split(/\s*,\s*|\s+[—–-]\s+/).filter(Boolean);
  if (parts.length >= 2) {
    // "Area, City[, State]" — try as a neighbourhood first, then as "Town, State".
    const town = await findTown(token, parts[1], parts[2] ?? null, country);
    if (town) {
      const loc = await findLocality(token, parts[0], town, country);
      if (loc) return { areas: [{ ...loc, why: "Added by you" }], notes: loc.geo ? [] : [`${loc.name} isn't on Meta's list — added as a 1.5 km circle.`] };
    }
    const asTown = await findTown(token, parts[0], parts[1], country);
    if (asTown) return { areas: [{ ...townArea(asTown, scope === "hyper-local" ? "local" : scope), why: "Added by you" }], notes: [] };
    return { areas: [], notes: [`Couldn't find "${q}". Try "Area, City" or drop a pin on the map.`] };
  }
  const town = await findTown(token, q, null, country);
  if (!town) return { areas: [], notes: [`Couldn't find "${q}". Try "Area, City" or drop a pin on the map.`] };
  return { areas: [{ ...townArea(town, scope === "hyper-local" ? "local" : scope), why: "Added by you" }], notes: [] };
}
