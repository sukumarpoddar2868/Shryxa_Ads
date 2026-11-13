"use client";

import { useId, useState, useTransition } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { LANGUAGE_TO_LOCALES } from "../engine/presets.ts";
import { resolveAreaAction } from "../ai/actions";
import dynamic from "next/dynamic";
import { SCOPE_INFO, type ReachScope } from "../ai/prompts.ts";
import { DEVICE_LABELS, isPlaced, type DeviceOs, type DraftPin, type GeoRef } from "./blueprint";
import type { SectionProps } from "./create-campaign";
import { AudienceEstimate } from "./audience-estimate";
import { AudienceTargeting } from "./audience-targeting";
import { ChipInput, ChoiceCard, Group, Header, Segmented, set } from "./sections";

// Map is browser-only (WebGL); loads after the page.
const AreaMap = dynamic(() => import("./area-map"), {
  ssr: false,
  loading: () => <div className="grid h-72 place-items-center rounded-card bg-lavender-soft text-[13px] text-ink-muted">Loading map…</div>,
});

/** Radius for a pin dropped on the map, by reach scope. */
const SCOPE_RADIUS: Record<ReachScope, number> = { "hyper-local": 1.5, local: 5, "city-wide": 15, metro: 40 };

const RADII = [1, 1.5, 2, 3, 5, 8, 10, 15, 20, 25, 40, 60, 80];
/** Meta city ids: the city itself, or city + 17–80 km. */
const CITY_RADII = [17, 25, 40, 60, 80];
/**
 * A circle around a Meta area's centre instead of the area itself (smallest circle: 1 km).
 * Measured on Meta's audience estimate, Nov 2026: for a town a circle reaches fewer people than
 * the whole town; for a neighbourhood it reaches far more, because Meta's neighbourhood ids are
 * its tightest areas. So the two are labelled "Smaller" and "Wider".
 */
const CIRCLE_RADII = { city: [1, 2, 3, 5, 8, 10, 15], area: [1, 1.5, 2, 3, 5] };
const AREA_KIND: Record<string, string> = { city: "Town / city", neighborhood: "Neighbourhood", subcity: "Area", zip: "PIN code", pin: "Pin", circle: "Circle" };
const WHOLE: Record<GeoRef["kind"], string> = { city: "Whole town", neighborhood: "Whole neighbourhood", subcity: "Whole area", zip: "Whole PIN code area" };
/** Circle drawn on the map for a Meta area (Meta targets its own shape, not this circle). */
const DISPLAY_KM: Record<GeoRef["kind"], number> = { city: 5, neighborhood: 1.5, subcity: 1.5, zip: 3 };

export function AudienceSection({ draft, update, goTo, clients }: SectionProps) {
  const a = draft.audience;
  const ageId = useId();
  const ages = Array.from({ length: 65 - 18 + 1 }, (_, i) => 18 + i);
  const [area, setArea] = useState("");
  const [areaError, setAreaError] = useState<string | null>(null);
  const [areaNote, setAreaNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [addMode, setAddMode] = useState(false);

  const setPins = (fn: (p: DraftPin[]) => DraftPin[]) => update((d) => ({ ...d, audience: { ...d.audience, locations: fn(d.audience.locations) } }));

  const addArea = () => {
    const city = area.trim();
    if (!city || !draft.clientId) return;
    setAreaError(null);
    setAreaNote(null);
    start(async () => {
      const r = await resolveAreaAction({
        clientId: draft.clientId!,
        city,
        scope: draft.setup.scope,
        businessName: draft.setup.businessName,
        about: draft.setup.about,
        currency: draft.campaign.currency,
      });
      if (!r.ok) return setAreaError(r.error);
      setPins((p) => [...p, ...r.pins.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, radiusKm: x.radius_km, why: x.why, geo: x.geo }))]);
      setArea("");
      setAreaNote(r.notes[0] ?? null);
    });
  };

  return (
    <>
      <Header level="Ad set" title="Audience" blurb="Who should see the ad. For local businesses, a tight area matters more than anything else." />
      <div className="flex flex-col gap-6">
        <AudienceEstimate draft={draft} />

        <Group title="Who to target" hint="Core audience works for most local businesses. Add custom or lookalike audiences when you have customers or engagers.">
          <AudienceTargeting draft={draft} update={update} client={clients.find((c) => c.id === draft.clientId)} />
        </Group>

        <Group
          title="Locations"
          hint={`Towns, neighbourhoods and PIN codes use Meta’s own areas; pins are circles. A neighbourhood is the tightest area Meta offers. For a town you can pick a smaller circle around its centre; the audience size above shows the effect. Scope: ${SCOPE_INFO[draft.setup.scope].label}.`}
        >
          {!draft.generated && a.locations.length === 0 && (
            <Callout>
              Areas are picked by AI in{" "}
              <button type="button" onClick={() => goTo("start")} className="font-bold text-tomato-700 hover:underline">
                Start
              </button>
              . You can also add one below.
            </Callout>
          )}

          {a.locations.length > 0 && (
            <ul className="flex flex-col gap-2">
              {a.locations.map((p, i) => {
                // The Meta area this row is, or the one its circle was made from.
                const ref = p.geo ?? p.origin ?? null;
                const isCity = ref?.kind === "city";
                // A circle needs the area's own centre. A PIN is only shown at its town's centre, so no circle for it.
                const canCircle = ref !== null && ref.kind !== "zip" && isPlaced(p);
                const circles = isCity ? CIRCLE_RADII.city : CIRCLE_RADII.area;
                return (
                  <li key={`${p.name}-${i}`} className="flex flex-col gap-2 rounded-card bg-lavender-soft p-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-1 size-4 shrink-0 text-lavender-deep" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold">{p.name}</p>
                        {p.why && <p className="text-[13px] text-ink-muted">{p.why}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPins((all) => all.filter((_, j) => j !== i))}
                        className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-paper"
                        aria-label={`Remove ${p.name}`}
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
                      <p className="text-[12px] text-ink-muted">
                        <span className="mr-1.5 rounded-pill bg-paper px-2 py-0.5 font-bold text-lavender-deep">{AREA_KIND[p.geo?.kind ?? (p.origin ? "circle" : "pin")]}</span>
                        {p.geo ? (
                          isPlaced(p) ? "Meta's own area" : "Meta's own area · not on the map right now"
                        ) : p.origin ? (
                          isCity ? `Only within ${p.radiusKm} km of the centre` : `Within ${p.radiusKm} km of its centre`
                        ) : (
                          <span className="tabular-nums">{p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}</span>
                        )}
                      </p>
                      {(!ref || isCity || canCircle) && (
                        <label className="flex items-center gap-2 text-[13px] font-bold">
                          <span className="sr-only">Size of {p.name}</span>
                          {ref ? (
                            <Select
                              className="h-9 w-52 bg-paper text-[14px]"
                              // "m:" = Meta's own area (city: 0 = the town, 17–80 = town + km); "c:" = a circle around its centre.
                              value={p.geo ? `m:${ref.kind === "city" && p.radiusKm >= 17 ? p.radiusKm : 0}` : `c:${p.radiusKm}`}
                              onChange={(e) => {
                                const [mode, n] = e.target.value.split(":");
                                const v = Number(n);
                                setPins((all) =>
                                  all.map((x, j) =>
                                    j !== i
                                      ? x
                                      : mode === "m"
                                        ? { ...x, geo: ref, origin: null, radiusKm: ref.kind === "city" && v >= 17 ? v : DISPLAY_KM[ref.kind] }
                                        : { ...x, geo: null, origin: ref, radiusKm: v },
                                  ),
                                );
                              }}
                            >
                              <optgroup label="Meta's own area">
                                <option value="m:0">{WHOLE[ref.kind]}</option>
                                {ref.kind === "city" &&
                                  CITY_RADII.map((r) => (
                                    <option key={r} value={`m:${r}`}>
                                      Town + {r} km
                                    </option>
                                  ))}
                              </optgroup>
                              {canCircle && (
                                <optgroup label={isCity ? "Smaller: circle around the centre" : "Wider: circle around its centre"}>
                                  {[...new Set([...circles, ...(p.geo ? [] : [p.radiusKm])])].sort((x, y) => x - y).map((r) => (
                                    <option key={r} value={`c:${r}`}>
                                      {isCity ? `Only within ${r} km` : `Within ${r} km`}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </Select>
                          ) : (
                            <Select
                              className="h-9 w-36 bg-paper text-[14px]"
                              value={p.radiusKm}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setPins((all) => all.map((x, j) => (j === i ? { ...x, radiusKm: v } : x)));
                              }}
                            >
                              {[...new Set([...RADII, p.radiusKm])].sort((x, y) => x - y).map((r) => (
                                <option key={r} value={r}>
                                  {r} km circle
                                </option>
                              ))}
                            </Select>
                          )}
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-area" className="text-[13px] font-bold">
              Add another area
            </label>
            <div className="flex gap-2">
              <Input
                id="add-area"
                value={area}
                placeholder="e.g. Whitefield, Bangalore · Chaibasa · 833201"
                onChange={(e) => setArea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addArea();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addArea} disabled={pending || !area.trim() || !draft.clientId}>
                <Plus className="size-4" aria-hidden />
                {pending ? "Finding…" : "Add"}
              </Button>
            </div>
            {areaError && <p className="text-[13px] text-tomato-700">{areaError}</p>}
            {areaNote && <p className="text-[13px] text-ink-muted">{areaNote}</p>}
            <p className="text-[12px] text-ink-muted">Type a town, &ldquo;Area, City&rdquo; (e.g. HSR Layout, Bangalore) or a 6-digit PIN code.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-ink-muted">Drag a numbered pin to move an area.</p>
              <Button type="button" size="sm" variant={addMode ? "primary" : "secondary"} onClick={() => setAddMode((v) => !v)} aria-pressed={addMode}>
                <MapPin className="size-4" aria-hidden /> {addMode ? "Click the map to drop a pin…" : "Add pin by clicking"}
              </Button>
            </div>
            <AreaMap
              pins={a.locations}
              addMode={addMode}
              onMove={(i, lat, lng) =>
                // A moved Meta area (or a circle tightened from one) becomes a plain circle where it was dropped.
                setPins((all) =>
                  all.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          lat,
                          lng,
                          geo: null,
                          origin: null,
                          name: x.geo || x.origin ? `${x.name} (moved)` : x.name,
                          radiusKm: x.geo ? (x.geo.kind === "city" ? Math.max(5, Math.min(x.radiusKm, 25)) : 1.5) : x.radiusKm,
                        }
                      : x,
                  ),
                )
              }
              onAdd={(lat, lng) => {
                setPins((all) => [...all, { name: `Dropped pin ${all.length + 1}`, lat, lng, radiusKm: SCOPE_RADIUS[draft.setup.scope], why: "Added on the map" }]);
                setAddMode(false);
              }}
            />
          </div>
        </Group>

        <Group title="People">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id={`${ageId}-min`} label="Age from">
              <Select id={`${ageId}-min`} value={a.ageMin} onChange={(e) => set(update, "audience", { ageMin: Number(e.target.value), ageMax: Math.max(a.ageMax, Number(e.target.value)) })}>
                {ages.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`${ageId}-max`} label="Age to">
              <Select id={`${ageId}-max`} value={a.ageMax} onChange={(e) => set(update, "audience", { ageMax: Number(e.target.value) })}>
                {ages.filter((n) => n >= a.ageMin).map((n) => (
                  <option key={n} value={n}>
                    {n === 65 ? "65+" : n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="language" label="Language">
              <Select id="language" value={a.language} onChange={(e) => set(update, "audience", { language: e.target.value })}>
                {Object.keys(LANGUAGE_TO_LOCALES).map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
          {a.why && <p className="rounded-input bg-chartreuse-soft px-3 py-2 text-[13px]">AI: {a.why}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-bold">Gender</span>
            <Segmented
              label="Gender"
              value={a.gender}
              onChange={(v) => set(update, "audience", { gender: v })}
              options={[
                { value: "any", label: "All" },
                { value: "female", label: "Women" },
                { value: "male", label: "Men" },
              ]}
            />
          </div>
        </Group>

        <Group title="Phone type" hint="Reach only Android or only iPhone users. iPhone-only is a common way to reach higher-income buyers.">
          <Segmented
            label="Phone type"
            value={a.device}
            onChange={(v: DeviceOs) =>
              update((d) => ({
                ...d,
                audience: { ...d.audience, device: v },
                // Meta allows phone targeting only with manual placements.
                placements: v === "all" ? d.placements : { ...d.placements, mode: "manual" },
              }))
            }
            options={(Object.keys(DEVICE_LABELS) as DeviceOs[]).map((k) => ({ value: k, label: DEVICE_LABELS[k] }))}
          />
          {a.device !== "all" && (
            <p className="text-[13px] text-ink-muted">Ads show on phones only, and Placements switch to manual (Meta&apos;s rule for phone targeting).</p>
          )}
        </Group>

        <Group title="Interests" hint="Matched to real Meta interests at launch (closest match each). Leave empty to reach everyone in your areas who fits the age and gender.">
          <ChipInput id="interests" values={a.interests} max={5} onChange={(v) => set(update, "audience", { interests: v })} placeholder="e.g. Personal finance" />
        </Group>

        <Group title="Audience mode">
          <div role="radiogroup" aria-label="Audience mode" className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              title="Local & strict"
              blurb="Only people matching your area, age and gender. Best for new accounts and small areas."
              badge="Recommended"
              selected={a.mode === "strict"}
              onSelect={() => set(update, "audience", { mode: "strict" })}
            />
            <ChoiceCard
              title="Let Meta find people"
              blurb="Advantage+ audience: Meta may go beyond your settings, but stays inside your areas."
              selected={a.mode === "advantage"}
              onSelect={() => set(update, "audience", { mode: "advantage" })}
            />
          </div>
        </Group>
      </div>
    </>
  );
}
