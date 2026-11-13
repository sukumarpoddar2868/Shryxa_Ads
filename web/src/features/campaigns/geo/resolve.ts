import "server-only";
import { metaEnv } from "@/lib/env";
import { graphGet } from "@/lib/meta/graph";
import type { GeoRef } from "../engine/render.ts";
import { distanceKm, nameMatches, spellings } from "./match.ts";

/**
 * Place names → target areas. Targeting needs only Meta: city, neighbourhood and PIN ids come from
 * Meta's location search, and a neighbourhood is accepted when Meta says it belongs to the city.
 * OpenStreetMap only puts things on the map (Meta gives cities and PINs no coordinates) and
 * supplies a pin for an area Meta doesn't list. Every match is checked; nothing is guessed.
 */

export type Area = {
  name: string;
  /** Map position. null only for a Meta area that couldn't be placed (map search down): it is still targeted by its id. */
  lat: number | null;
  lng: number | null;
  /** For pins: the circle. For city ids: 0 = the city itself, 17–80 = city + radius. Display-only for neighbourhoods/PINs. */
  radius_km: number;
  why: string;
  geo: GeoRef | null;
};

export type Scope = "hyper-local" | "local" | "city-wide" | "metro";

type MetaPlace = { key: string; name: string; type: string; region?: string; region_id?: number; primary_city?: string };
type MetaMeta = { name: string; city?: string; city_id?: number; region?: string; latitude?: string; longitude?: string };
/** `alt`: other names OpenStreetMap lists for the place (old names such as Bangalore for Bengaluru). */
type OsmPlace = { name: string; alt: string[]; lat: number; lng: number; state: string | null; city: string | null; country: string | null; kind: string };

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

/** Neither map search answered: a temporary outage, not a wrong place name. */
export class MapSearchUnavailableError extends Error {
  constructor() {
    super("The map search isn't responding right now. Please try again in a minute.");
    this.name = "MapSearchUnavailableError";
  }
}

const osmHeaders = () => ({ "User-Agent": `ShryxaAds/1.0 (${metaEnv().APP_URL})` });
type Near = { lat: number; lng: number };

/** Photon is a free public service and goes down at times: skip it for a while after a failure. */
let photonDownUntil = 0;

/** null = the service didn't answer (not the same as "no such place"). */
async function photon(q: string, country: string, near?: Near): Promise<OsmPlace[] | null> {
  if (Date.now() < photonDownUntil) return null;
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  try {
    const res = await fetch(url, { headers: osmHeaders(), signal: AbortSignal.timeout(4000), next: { revalidate: 86_400 } });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const body = (await res.json()) as {
      features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
    };
    return (body.features ?? [])
      .filter((f) => (f.properties.countrycode ?? "").toUpperCase() === country)
      .map((f) => ({
        name: f.properties.name ?? "",
        alt: [],
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        state: f.properties.state ?? null,
        city: f.properties.city ?? f.properties.county ?? null,
        country: f.properties.country ?? null,
        kind: `${f.properties.osm_key}:${f.properties.osm_value}`,
      }));
  } catch {
    photonDownUntil = Date.now() + 5 * 60_000;
    return null;
  }
}

type NominatimHit = {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string | undefined>;
  namedetails?: Record<string, string | undefined> | null;
};
const ALT_NAME_KEYS = /^(name:en|(alt|old|official|short|loc)_name(:en)?)$/;

/** Nominatim allows one request a second, so calls wait in line. */
let nominatimLine: Promise<unknown> = Promise.resolve();

/** OpenStreetMap's own search: the second source when Photon is down or has nothing. null = it didn't answer. */
function nominatim(q: string, country: string, near?: Near): Promise<OsmPlace[] | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("limit", "8");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("countrycodes", country.toLowerCase());
  if (near) url.searchParams.set("viewbox", [near.lng - 0.5, near.lat + 0.5, near.lng + 0.5, near.lat - 0.5].join(","));
  const run = async (): Promise<OsmPlace[] | null> => {
    try {
      const res = await fetch(url, { headers: osmHeaders(), signal: AbortSignal.timeout(8000), next: { revalidate: 86_400 } });
      if (!res.ok) return null;
      return ((await res.json()) as NominatimHit[])
        .map((h) => ({
          name: h.name || (h.display_name ?? "").split(",")[0].trim(),
          alt: Object.entries(h.namedetails ?? {})
            .filter(([k]) => ALT_NAME_KEYS.test(k))
            .flatMap(([, v]) => (v ?? "").split(";").map((x) => x.trim()).filter(Boolean)),
          lat: Number(h.lat),
          lng: Number(h.lon),
          state: h.address?.state ?? null,
          city: h.address?.city ?? h.address?.town ?? h.address?.village ?? h.address?.county ?? null,
          country: h.address?.country ?? null,
          kind: `${h.category}:${h.type}`,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    } catch {
      return null;
    }
  };
  const turn = nominatimLine.then(run);
  nominatimLine = turn.then(() => new Promise((r) => setTimeout(r, 1100)));
  return turn;
}

/**
 * Place search on OpenStreetMap data. Photon first; Nominatim when Photon is down, or when `want`
 * is given and none of Photon's places pass it (Nominatim also knows old names). null = neither answered.
 */
async function osmSearch(q: string, country: string, near?: Near, want?: (p: OsmPlace) => boolean): Promise<OsmPlace[] | null> {
  const first = await photon(q, country, near);
  if (first && (!want || first.some(want))) return first;
  return (await nominatim(q, country, near)) ?? first;
}

const sameRegion = (a?: string | null, b?: string | null) => !a || !b || nameMatches(a, b) === "exact";
const TOWN_KINDS = /^(place:(city|town|village|municipality)|boundary:administrative)$/;
const AREA_KINDS = /^place:(suburb|neighbourhood|quarter|locality|village|hamlet|city_block|borough)$/;
const MAX_KM_FROM_TOWN = 25;

type Placed = { lat: number; lng: number };
const isPlaced = <T extends { lat: number | null; lng: number | null }>(t: T): t is T & Placed => t.lat !== null && t.lng !== null;
const validPoint = (p: Placed) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

/* ---------------------------------------------------------- towns */

/** With a Meta city id the map position is optional; without one the town is a pin and always has a position. */
type Town = { name: string; region: string | null } & ({ key: string; lat: number | null; lng: number | null } | { key: null; lat: number; lng: number });

/** Rough centre of a Meta city from its own neighbourhoods (Meta gives the city itself no coordinates). null when it has none. */
async function metaCityCentre(token: string, city: MetaPlace, country: string): Promise<Placed | null> {
  const keys = (await metaSearch(token, city.name, ["neighborhood"], country)).filter((m) => m.type === "neighborhood").map((m) => m.key);
  const pts = Object.values(await metaDetails(token, "neighborhoods", keys))
    .filter((m) => String(m.city_id) === city.key)
    .map((m) => ({ lat: Number(m.latitude), lng: Number(m.longitude) }))
    .filter(validPoint);
  if (!pts.length) return null;
  return { lat: pts.reduce((sum, p) => sum + p.lat, 0) / pts.length, lng: pts.reduce((sum, p) => sum + p.lng, 0) / pts.length };
}

/**
 * A town or city. The Meta city id is enough to target it; OpenStreetMap adds the map position.
 * No Meta id → a pin at the map's position. Throws MapSearchUnavailableError only when Meta
 * doesn't list the place and no map search answered.
 */
export async function findTown(token: string | null, town: string, state: string | null, country: string): Promise<Town | null> {
  // The typed name, or a name the place used to have ("Bangalore" finds Bengaluru).
  const named = (p: OsmPlace) => (nameMatches(town, p.name) !== null || p.alt.some((a) => nameMatches(town, a) === "exact")) && sameRegion(state, p.state);
  const places = await osmSearch(state ? `${town}, ${state}` : town, country, undefined, named);
  const osm = (places ?? []).filter(named);
  const centre = osm.find((p) => TOWN_KINDS.test(p.kind)) ?? osm[0] ?? null;

  let meta: MetaPlace | null = null;
  let fromMeta: Placed | null = null;
  if (token) {
    const cities = (await metaSearch(token, town, ["city"], country)).filter((m) => m.type === "city" && sameRegion(state ?? centre?.state, m.region));
    meta = cities.find((m) => nameMatches(town, m.name) === "exact") ?? null;
    // Meta files some cities under another name (Bengaluru → "Bangalore"). Take its only city
    // result when the map agrees: that city's neighbourhoods sit around the map's centre.
    if (!meta && centre && cities.length === 1) {
      const c = await metaCityCentre(token, cities[0], country);
      if (c && distanceKm(centre, c) <= MAX_KM_FROM_TOWN) meta = cities[0];
    }
    if (meta && !centre) fromMeta = await metaCityCentre(token, meta, country);
  }
  if (centre) {
    const at = { lat: centre.lat, lng: centre.lng };
    return meta ? { name: meta.name, region: meta.region ?? centre.state, ...at, key: meta.key } : { name: centre.name, region: centre.state, ...at, key: null };
  }
  // Meta lists the city but the map couldn't place it: still targeted by its id.
  if (meta) return { name: meta.name, region: meta.region ?? null, lat: fromMeta?.lat ?? null, lng: fromMeta?.lng ?? null, key: meta.key };
  if (!places) throw new MapSearchUnavailableError();
  return null;
}

/* ---------------------------------------------------------- neighbourhoods */

/** A neighbourhood inside a known town: Meta neighbourhood id, else an OSM pin, else null. */
export async function findLocality(token: string | null, area: string, town: Town, country: string): Promise<Area | null> {
  const here = isPlaced(town) ? town : null;
  if (token) {
    const lists = await Promise.all(spellings(area).map((q) => metaSearch(token, q, ["neighborhood", "subcity"], country)));
    const hits = [...new Map(lists.flat().map((m) => [m.key, m])).values()].filter((m) => nameMatches(area, m.name));
    const byKind = (t: string) => hits.filter((h) => h.type === t).map((h) => h.key);
    const [nb, sc] = await Promise.all([metaDetails(token, "neighborhoods", byKind("neighborhood")), metaDetails(token, "subcities", byKind("subcity"))]);
    const candidates = hits
      .map((h) => {
        const m = (h.type === "neighborhood" ? nb : sc)[h.key];
        const at = { lat: Number(m?.latitude), lng: Number(m?.longitude) };
        if (!m || !validPoint(at)) return null;
        const km = here ? distanceKm(here, at) : null;
        // Meta's own word that it belongs to this city; or, for suburbs Meta files under a sister
        // city (Vashi → Navi Mumbai), close to the town in the same state.
        const inCity = town.key !== null && String(m.city_id) === town.key;
        const nearby = km !== null && km <= MAX_KM_FROM_TOWN && sameRegion(town.region, h.region);
        return inCity || nearby ? { h, ...at, km, inCity } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      // Exact name beats "Andheri East"-style prefix; then Meta's own city match; then nearest to town.
      .sort(
        (a, b) =>
          Number(nameMatches(area, b.h.name) === "exact") - Number(nameMatches(area, a.h.name) === "exact") ||
          Number(b.inCity) - Number(a.inCity) ||
          (a.km ?? 0) - (b.km ?? 0),
      );
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
  // Map fallback (needs the town's position): only real areas (suburb / neighbourhood / locality), never roads, shops or bus stops.
  if (!here) return null;
  const osm = ((await osmSearch(`${area}, ${town.name}`, country, here)) ?? [])
    .filter((p) => AREA_KINDS.test(p.kind) && nameMatches(area, p.name) && distanceKm(here, p) <= MAX_KM_FROM_TOWN)
    .sort((a, b) => Number(nameMatches(area, b.name) === "exact") - Number(nameMatches(area, a.name) === "exact") || distanceKm(here, a) - distanceKm(here, b))[0];
  if (!osm) return null;
  return { name: `${osm.name} — ${town.name}`, lat: osm.lat, lng: osm.lng, radius_km: 1.5, why: "", geo: null };
}

/* ---------------------------------------------------------- PIN codes */

export async function findZip(token: string | null, code: string, country: string): Promise<Area | null> {
  if (!token) return null;
  const hit = (await metaSearch(token, code, ["zip"], country)).find((m) => m.name === code);
  if (!hit) return null;
  // Meta gives a PIN no coordinates: show it at its main town when that can be placed.
  const town = hit.primary_city ? await findTown(token, hit.primary_city, hit.region ?? null, country).catch(() => null) : null;
  return {
    name: `PIN ${code}${hit.primary_city ? ` — ${hit.primary_city}` : ""}`,
    lat: town?.lat ?? null,
    lng: town?.lng ?? null,
    radius_km: 3,
    why: "",
    geo: { kind: "zip", key: hit.key },
  };
}

/* ---------------------------------------------------------- whole towns by scope */

/** Town-level area for a scope: Meta city id (city only / + radius) or an OSM pin. */
export function townArea(town: Town, scope: Scope): Area {
  const name = `${town.name}${town.region ? `, ${town.region}` : ""}`;
  if (town.key !== null) {
    const radius = { "hyper-local": 0, local: 0, "city-wide": 17, metro: 40 }[scope];
    return { name, lat: town.lat, lng: town.lng, radius_km: radius || 5, why: "", geo: { kind: "city", key: town.key } };
  }
  const pinRadius = { "hyper-local": 5, local: 8, "city-wide": 20, metro: 40 }[scope];
  return { name, lat: town.lat, lng: town.lng, radius_km: pinRadius, why: "", geo: null };
}

/* ---------------------------------------------------------- orchestration */

export type Resolved = { areas: Area[]; notes: string[] };

/** Tell the person when a Meta area is targeted but couldn't be drawn. */
const unplacedNotes = (areas: Area[]) => areas.filter((a) => !isPlaced(a)).map((a) => `${a.name} is added and will be targeted, but the map can't show it right now.`);

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
      let town: Town | null;
      try {
        town = await findTown(token, city, state || null, country);
      } catch (e) {
        if (!(e instanceof MapSearchUnavailableError)) throw e;
        notes.push(`Couldn't look up "${city}" right now: it isn't on Meta's city list and the map search isn't responding. Try again in a minute.`);
        return;
      }
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
  const unique = areas.filter((a) => {
    const k = a.geo ? `${a.geo.kind}:${a.geo.key}` : `${a.lat?.toFixed(3)},${a.lng?.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { areas: unique, notes: [...notes, ...unplacedNotes(unique)] };
}

/**
 * What a person typed in "Add area": a PIN code, "Area, City", or a town.
 * No AI — direct lookup.
 */
export async function resolveTyped(token: string | null, text: string, scope: Scope, country: string): Promise<Resolved> {
  const q = text.trim();
  const done = (area: Area, why: string, notes: string[] = []): Resolved => ({ areas: [{ ...area, why }], notes: [...notes, ...unplacedNotes([area])] });
  const notFound: Resolved = { areas: [], notes: [`Couldn't find "${q}". Try "Area, City" or drop a pin on the map.`] };
  if (/^\d{6}$/.test(q) && country === "IN") {
    const zip = await findZip(token, q, country);
    return zip ? done(zip, "Added by PIN code") : { areas: [], notes: [`PIN code ${q} isn't on Meta's list.`] };
  }
  const townScope = scope === "hyper-local" ? "local" : scope;
  const parts = q.split(/\s*,\s*|\s+[—–-]\s+/).filter(Boolean);
  if (parts.length >= 2) {
    // "Area, City[, State]" — try as a neighbourhood first, then as "Town, State".
    const town = await findTown(token, parts[1], parts[2] ?? null, country);
    if (town) {
      const loc = await findLocality(token, parts[0], town, country);
      if (loc) return done(loc, "Added by you", loc.geo ? [] : [`${loc.name} isn't on Meta's list — added as a 1.5 km circle.`]);
    }
    const asTown = await findTown(token, parts[0], parts[1], country);
    return asTown ? done(townArea(asTown, townScope), "Added by you") : notFound;
  }
  const town = await findTown(token, q, null, country);
  return town ? done(townArea(town, townScope), "Added by you") : notFound;
}
