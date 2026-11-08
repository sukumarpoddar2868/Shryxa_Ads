"use client";

import { useState, type ReactNode } from "react";
import { Image as ImageIcon, Lock, Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { Callout, Chip } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { CTA_FOR_LEAD_FORM, CTA_FOR_WEBSITE, CURRENCIES, CURRENCY, MEDIA_SLOTS } from "../engine/presets.ts";
import type { CtaType } from "../engine/schema.ts";
import { PLANNED, type Draft, type SectionId } from "./blueprint";
import type { SectionProps } from "./create-campaign";

/* ------------------------------------------------------------------ shared */

export function Header({ level, title, blurb }: { level: string; title: string; blurb: string }) {
  return (
    <header className="mb-6">
      <p className="text-[12px] font-bold uppercase tracking-wide text-lavender-deep">{level}</p>
      <h2 className="mt-1 text-[24px] font-extrabold leading-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-muted">{blurb}</p>
    </header>
  );
}

/** "What this module becomes" — the blueprint's to-build list. */
export function Planned({ id }: { id: SectionId }) {
  const items = PLANNED[id];
  if (!items?.length) return null;
  return (
    <section aria-label="Planned for this step" className="mt-8 rounded-card bg-lavender-soft p-5">
      <p className="flex items-center gap-2 text-[13px] font-bold">
        <Wrench className="size-4" aria-hidden /> Coming to this step
      </p>
      <ul className="mt-2 grid gap-1.5 text-[14px] text-ink-muted sm:grid-cols-2">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-lavender-deep" />
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Group({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-line pt-6 first-of-type:border-0 first-of-type:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-[16px] font-extrabold">{title}</p>
        {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** Pill radio group. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-pill bg-lavender-soft p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-pill px-4 py-1.5 text-[14px] font-bold transition-colors",
            value === o.value ? "bg-chartreuse text-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Large selectable card (objective, setup mode, audience mode). */
export function ChoiceCard({
  selected,
  disabled,
  onSelect,
  icon,
  title,
  blurb,
  badge,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: string;
  blurb: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      onClick={() => !disabled && onSelect()}
      className={cn(
        "flex h-full flex-col gap-2 rounded-card p-5 text-left ring-1 ring-inset transition-colors",
        selected ? "bg-chartreuse-soft ring-2 ring-ink" : "bg-paper ring-line hover:ring-ink/40",
        disabled && "cursor-not-allowed opacity-60 hover:ring-line",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[16px] font-extrabold">
          {icon}
          {title}
        </span>
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-lavender-soft px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">
            {disabled && <Lock className="size-3" aria-hidden />}
            {badge}
          </span>
        )}
      </span>
      <span className="text-[14px] text-ink-muted">{blurb}</span>
    </button>
  );
}

/** Type + Enter to add chips (locations, interests). */
export function ChipInput({
  id,
  values,
  onChange,
  placeholder,
  max = 10,
}: {
  id: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  max?: number;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase()) && values.length < max) onChange([...values, v]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!text.trim() || values.length >= max}>
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-pill bg-lavender py-1 pl-3 pr-1 text-[13px] font-bold">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="grid size-6 place-items-center rounded-full hover:bg-paper/60"
                aria-label={`Remove ${v}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TextArea({
  id,
  value,
  onChange,
  max,
  rows = 3,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  placeholder?: string;
}) {
  const over = value.length > max;
  return (
    <div className="flex flex-col gap-1">
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={over || undefined}
        className={cn(inputClass, "h-auto resize-y py-3 leading-relaxed")}
      />
      <p className={cn("self-end text-[12px] tabular-nums", over ? "text-tomato-700" : "text-ink-muted")}>
        {value.length} / {max}
      </p>
    </div>
  );
}

export const set = <K extends keyof Draft>(update: SectionProps["update"], key: K, patch: Partial<Draft[K]>) =>
  update((d) => ({ ...d, [key]: { ...(d[key] as object), ...patch } }));

/* ------------------------------------------------------------------ Campaign */

export function NameBudgetSection({ draft, update, clients }: SectionProps) {
  const c = draft.campaign;
  const cur = CURRENCY[c.currency];
  const amount = Number(c.amount) || 0;
  const client = clients.find((x) => x.id === draft.clientId);
  const suggested = [client?.name, draft.objective === "OUTCOME_TRAFFIC" ? "Traffic" : "Leads"].filter(Boolean).join(" — ");

  return (
    <>
      <Header level="Campaign" title="Name & budget" blurb="The campaign holds your objective, budget and the safety spend cap." />
      <div className="flex flex-col gap-6">
        <Group title="Campaign name">
          <Field id="campaignName" label="Name" hint="Only you see this — use something you'll recognise in reports.">
            <div className="flex gap-2">
              <Input id="campaignName" value={c.name} placeholder={suggested || "e.g. Diwali offer — Leads"} onChange={(e) => set(update, "campaign", { name: e.target.value })} />
              {suggested && !c.name && (
                <Button type="button" variant="ghost" onClick={() => set(update, "campaign", { name: suggested })}>
                  Use suggestion
                </Button>
              )}
            </div>
          </Field>
        </Group>

        <Group title="Budget" hint="Set on the ad set by default (one ad set in v1).">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Budget type"
              value={c.budgetType}
              onChange={(v) => set(update, "campaign", { budgetType: v })}
              options={[
                { value: "daily", label: "Daily" },
                { value: "lifetime", label: "Lifetime" },
              ]}
            />
            <Segmented
              label="Currency"
              value={c.currency}
              onChange={(v) => set(update, "campaign", { currency: v, amount: String(CURRENCY[v].defaultDailyBudget) })}
              options={CURRENCIES.map((x) => ({ value: x, label: `${CURRENCY[x].symbol} ${x}` }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="budget" label={c.budgetType === "daily" ? "Daily budget" : "Total budget"} hint={`In ${c.currency}. Meta spends about this much on average.`}>
              <div className="relative">
                <span aria-hidden className="absolute inset-y-0 left-4 grid place-items-center font-bold text-ink-muted">
                  {cur.symbol}
                </span>
                <Input id="budget" inputMode="decimal" className="pl-9" value={c.amount} onChange={(e) => set(update, "campaign", { amount: e.target.value.replace(/[^\d.]/g, "") })} />
              </div>
            </Field>
            <div className="flex flex-col justify-center rounded-card bg-lavender-soft px-4 py-3 text-[14px]">
              <p className="text-[12px] font-bold text-ink-muted">Safety spend cap (automatic)</p>
              <p className="font-extrabold tabular-nums">
                {cur.symbol}
                {(amount * (c.budgetType === "daily" ? cur.defaultSpendCapMultiplier : 1)).toLocaleString("en-IN")}
              </p>
              <p className="text-[12px] text-ink-muted">The campaign stops if total spend reaches this.</p>
            </div>
          </div>
        </Group>

        <Group title="Schedule" hint="Leave the end date empty to run until you pause it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="start" label="Start date">
              <Input id="start" type="date" value={c.startDate} onChange={(e) => set(update, "campaign", { startDate: e.target.value })} />
            </Field>
            <Field id="end" label="End date" hint={c.budgetType === "lifetime" ? "Required for a lifetime budget." : undefined}>
              <Input id="end" type="date" value={c.endDate} min={c.startDate || undefined} onChange={(e) => set(update, "campaign", { endDate: e.target.value })} />
            </Field>
          </div>
        </Group>
      </div>
      <Planned id="name-budget" />
    </>
  );
}

/* ------------------------------------------------------------------ Ad set */

export function PlacementsSection({ draft, update, goTo }: SectionProps) {
  const p = draft.placements;
  const phoneTargeting = draft.audience.device !== "all";
  return (
    <>
      <Header level="Ad set" title="Placements" blurb="Where your ad appears across Facebook and Instagram." />
      <div className="flex flex-col gap-6">
        <div role="radiogroup" aria-label="Placement mode" className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            title="Advantage+ placements"
            blurb="Meta picks the best spots for results — Feeds, Stories, Reels."
            badge={phoneTargeting ? "Off" : "Recommended"}
            disabled={phoneTargeting}
            selected={p.mode === "advantage"}
            onSelect={() => set(update, "placements", { mode: "advantage" })}
          />
          <ChoiceCard
            title="Manual placements"
            blurb="Choose the platforms yourself."
            selected={p.mode === "manual"}
            onSelect={() => set(update, "placements", { mode: "manual" })}
          />
        </div>
        {phoneTargeting && (
          <Callout>
            You&apos;re targeting {draft.audience.device === "ios" ? "iPhone" : "Android"} users, so placements must be manual.{" "}
            <button type="button" onClick={() => goTo("audience")} className="font-bold text-tomato-700 hover:underline">
              Change phone type
            </button>
          </Callout>
        )}
        {p.mode === "manual" && (
          <Group title="Platforms">
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["facebook", "Facebook"],
                  ["instagram", "Instagram"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={cn("flex cursor-pointer items-center gap-3 rounded-pill px-4 py-2 text-[14px] font-bold ring-1 ring-inset", p[key] ? "bg-chartreuse-soft ring-ink" : "ring-line")}>
                  <input type="checkbox" className="size-4 accent-lavender-deep" checked={p[key]} onChange={(e) => set(update, "placements", { [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            {!p.facebook && !p.instagram && <p className="text-[13px] text-tomato-700">Pick at least one platform.</p>}
          </Group>
        )}
      </div>
      <Planned id="placements" />
    </>
  );
}

/* ------------------------------------------------------------------ Ad */

export function CreativeSection({ draft, update, clients, goTo }: SectionProps) {
  const ad = draft.ad;
  const client = clients.find((c) => c.id === draft.clientId);
  const ctas: CtaType[] = ad.destination === "website" ? CTA_FOR_WEBSITE : CTA_FOR_LEAD_FORM;
  const label = (c: string) => c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <>
      <Header level="Ad" title="Creative" blurb="What people see, and where they go when they tap." />
      <div className="flex flex-col gap-6">
        <Group title="Identity" hint="The ad runs from the client's Page and Instagram account.">
          <div className="flex flex-wrap gap-2">
            <Chip>Facebook · {client?.pageName ?? "No Page"}</Chip>
            <Chip>Instagram · {client?.instagramUsername ? `@${client.instagramUsername}` : "uses Facebook Page"}</Chip>
          </div>
        </Group>

        <Group title="Media" hint="Single image for now. Square is required; the others make each placement look right.">
          <div className="grid gap-3 sm:grid-cols-3">
            {MEDIA_SLOTS.map((s) => (
              <div key={s.key} className="flex flex-col items-center gap-2 rounded-card bg-lavender-soft p-4 text-center">
                <div
                  className="grid w-full max-w-[120px] place-items-center rounded-input bg-paper text-ink-muted ring-1 ring-dashed ring-line"
                  style={{ aspectRatio: s.aspect.replace(":", "/") }}
                >
                  <ImageIcon className="size-5" aria-hidden />
                </div>
                <p className="text-[13px] font-bold">
                  {s.label} {s.required && <span className="text-tomato-700">*</span>}
                </p>
                <p className="text-[12px] text-ink-muted">
                  {s.size} · {s.aspect}
                </p>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" className="self-start" disabled>
            Upload images (coming soon)
          </Button>
        </Group>

        <Group title="Text">
          <Field id="primaryText" label="Primary text">
            <TextArea id="primaryText" max={400} value={ad.primaryText} onChange={(v) => set(update, "ad", { primaryText: v })} placeholder="What's the offer, and why now?" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="headline" label="Headline">
              <TextArea id="headline" rows={2} max={40} value={ad.headline} onChange={(v) => set(update, "ad", { headline: v })} />
            </Field>
            <Field id="description" label="Description (optional)">
              <TextArea id="description" rows={2} max={125} value={ad.description} onChange={(v) => set(update, "ad", { description: v })} />
            </Field>
          </div>
          {draft.generated && (
            <p className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Sparkles className="size-4" aria-hidden /> Written by AI in Start — edit anything.
            </p>
          )}
        </Group>

        <Group title="Destination">
          <p className="text-[14px]">
            <strong>{ad.destination === "website" ? "Website" : "Instant form"}</strong>{" "}
            <span className="text-ink-muted">· set by your goal in</span>{" "}
            <button type="button" onClick={() => goTo("start")} className="font-bold text-tomato-700 hover:underline">
              Start
            </button>
          </p>
          {ad.destination === "website" ? (
            <Field id="url" label="Website URL">
              <Input id="url" type="url" placeholder="https://" value={ad.url} onChange={(e) => set(update, "ad", { url: e.target.value })} />
            </Field>
          ) : (
            <Callout>The instant form builder (questions, privacy link, thank-you screen) arrives with this step&apos;s deep build.</Callout>
          )}
          <Field id="cta" label="Button">
            <Select id="cta" value={ad.cta} onChange={(e) => set(update, "ad", { cta: e.target.value as CtaType })}>
              {ctas.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </Select>
          </Field>
        </Group>
      </div>
      <Planned id="creative" />
    </>
  );
}

/* ------------------------------------------------------------------ Review */

export function ReviewSection({ draft, goTo }: SectionProps) {
  const checks: { id: SectionId; label: string; ok: boolean }[] = [
    { id: "start", label: "Goal chosen and campaign drafted with AI", ok: draft.objective !== null && draft.generated },
    { id: "name-budget", label: "Name and budget set", ok: draft.campaign.name.trim() !== "" && Number(draft.campaign.amount) > 0 },
    { id: "audience", label: "At least one location", ok: draft.audience.locations.length > 0 },
    { id: "creative", label: "Primary text and headline written", ok: !!draft.ad.primaryText.trim() && !!draft.ad.headline.trim() },
  ];
  const allOk = checks.every((c) => c.ok);
  return (
    <>
      <Header level="Review" title="Review & launch" blurb="Check everything, then launch. Campaigns start paused so nothing spends by surprise." />
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-card bg-lavender-soft px-4 py-3 text-[14px]">
            <span className="flex items-center gap-2 font-bold">
              <Chip tone={c.ok ? "active" : "stopped"}>{c.ok ? "Done" : "Missing"}</Chip>
              {c.label}
            </span>
            {!c.ok && (
              <button type="button" onClick={() => goTo(c.id)} className="text-[13px] font-bold text-tomato-700 hover:underline">
                Fix →
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled>
          Check with Meta
        </Button>
        <Button type="button" disabled>
          Launch paused
        </Button>
      </div>
      {allOk && <p className="mt-3 text-[13px] text-ink-muted">Launching is wired up in the next build step.</p>}
      <Planned id="review" />
    </>
  );
}
