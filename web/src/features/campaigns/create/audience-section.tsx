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
import { DEVICE_LABELS, type DeviceOs, type DraftPin } from "./blueprint";
import type { SectionProps } from "./create-campaign";
import { AudienceEstimate } from "./audience-estimate";
import { AudienceTargeting } from "./audience-targeting";
import { ChipInput, ChoiceCard, Group, Header, Planned, Segmented, set } from "./sections";

// Map is browser-only (WebGL); loads after the page.
const AreaMap = dynamic(() => import("./area-map"), {
  ssr: false,
  loading: () => <div className="grid h-72 place-items-center rounded-card bg-lavender-soft text-[13px] text-ink-muted">Loading map…</div>,
});

/** Radius for a pin dropped on the map, by reach scope. */
const SCOPE_RADIUS: Record<ReachScope, number> = { "hyper-local": 1.5, local: 5, "city-wide": 15, metro: 40 };

const RADII = [1, 1.5, 2, 3, 5, 8, 10, 15, 20, 25, 40, 60, 80];

export function AudienceSection({ draft, update, goTo, clients }: SectionProps) {
  const a = draft.audience;
  const ageId = useId();
  const ages = Array.from({ length: 65 - 18 + 1 }, (_, i) => 18 + i);
  const [area, setArea] = useState("");
  const [areaError, setAreaError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [addMode, setAddMode] = useState(false);

  const setPins = (fn: (p: DraftPin[]) => DraftPin[]) => update((d) => ({ ...d, audience: { ...d.audience, locations: fn(d.audience.locations) } }));

  const addArea = () => {
    const city = area.trim();
    if (!city || !draft.clientId) return;
    setAreaError(null);
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
      setPins((p) => [...p, ...r.pins.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, radiusKm: x.radius_km, why: x.why }))]);
      setArea("");
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

        <Group title="Locations" hint={`Each area is a circle around a pin. Scope: ${SCOPE_INFO[draft.setup.scope].label}.`}>
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
              {a.locations.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex flex-wrap items-start gap-3 rounded-card bg-lavender-soft p-3 sm:flex-nowrap">
                  <MapPin className="mt-1 size-4 shrink-0 text-lavender-deep" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold">{p.name}</p>
                    {p.why && <p className="text-[13px] text-ink-muted">{p.why}</p>}
                    <p className="text-[12px] tabular-nums text-ink-muted">
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-[13px] font-bold">
                    <span className="sr-only">Radius for {p.name}</span>
                    <Select
                      className="h-9 w-28 text-[14px]"
                      value={p.radiusKm}
                      onChange={(e) => setPins((all) => all.map((x, j) => (j === i ? { ...x, radiusKm: Number(e.target.value) } : x)))}
                    >
                      {[...new Set([...RADII, p.radiusKm])].sort((x, y) => x - y).map((r) => (
                        <option key={r} value={r}>
                          {r} km
                        </option>
                      ))}
                    </Select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPins((all) => all.filter((_, j) => j !== i))}
                    className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-paper"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
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
                placeholder="e.g. Whitefield, Bangalore"
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
              onMove={(i, lat, lng) => setPins((all) => all.map((x, j) => (j === i ? { ...x, lat, lng } : x)))}
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

        <Group title="Interests" hint="AI suggestions. Not sent to Meta yet — until interest matching ships, ads reach everyone in your areas who fits the age and gender.">
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
      <Planned id="audience" />
    </>
  );
}
