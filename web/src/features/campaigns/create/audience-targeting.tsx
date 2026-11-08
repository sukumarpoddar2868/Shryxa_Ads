"use client";

import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { Callout, Chip } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import {
  createCustomerListAction,
  createLookalikeAction,
  createRuleAudienceAction,
  listAudiencesAction,
  type AudienceItem,
} from "../audiences/actions";
import { MAX_CUSTOMERS, hashRows, parseCustomerList } from "../audiences/customer-list";
import { CURRENCY } from "../engine/presets.ts";
import type { AudienceType, Draft, SelectedAudience } from "./blueprint";
import type { ClientOption, SectionProps } from "./create-campaign";
import { ChoiceCard, Segmented } from "./sections";

const KIND_LABEL: Record<string, string> = {
  customer_list: "Customer list",
  website: "Website visitors",
  engagement: "Engagement",
  lookalike: "Lookalike",
  other: "Audience",
};
const PHONE_CC: Record<string, string> = { INR: "91", USD: "1" };
const COUNTRIES = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AE", "UAE"],
  ["AU", "Australia"],
] as const;

type Err = { error: string; termsUrl?: string } | null;

/** Audience step → Core (default) / Custom / Lookalike, plus exclusions. */
export function AudienceTargeting({ draft, update, client }: Pick<SectionProps, "draft" | "update"> & { client?: ClientOption }) {
  const a = draft.audience;
  const clientId = draft.clientId;
  const [list, setList] = useState<AudienceItem[] | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [pending, start] = useTransition();

  const setAud = (patch: Partial<Draft["audience"]>) => update((d) => ({ ...d, audience: { ...d.audience, ...patch } }));
  const toggle = (field: "include" | "exclude", item: AudienceItem) => {
    const cur = a[field];
    const on = cur.some((x) => x.id === item.id);
    setAud({ [field]: on ? cur.filter((x) => x.id !== item.id) : [...cur, { id: item.id, name: item.name, kind: item.kind }] } as Partial<Draft["audience"]>);
  };
  const added = (item: AudienceItem) => {
    setList((l) => [item, ...(l ?? [])]);
    const sel: SelectedAudience = { id: item.id, name: item.name, kind: item.kind };
    update((d) => ({ ...d, audience: { ...d.audience, include: [...d.audience.include.filter((x) => x.id !== item.id), sel] } }));
  };

  const load = () => {
    if (!clientId) return setErr({ error: "Choose a client in Start first." });
    setErr(null);
    start(async () => {
      const r = await listAudiencesAction(clientId);
      if (!r.ok) return setErr(r);
      setList(r.audiences);
    });
  };

  const chooseType = (t: AudienceType) => {
    setAud({ type: t });
    if (t !== "core" && list === null && !pending) load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Audience type" className="grid gap-3 sm:grid-cols-3">
        <ChoiceCard title="Core audience" blurb="Location, age, gender and interests. Best to start with." badge="Default" selected={a.type === "core"} onSelect={() => chooseType("core")} />
        <ChoiceCard title="Custom audience" blurb="People who already know you: customers, site visitors, Page or Instagram engagers." selected={a.type === "custom"} onSelect={() => chooseType("custom")} />
        <ChoiceCard title="Lookalike audience" blurb="New people similar to your customers or engagers." selected={a.type === "lookalike"} onSelect={() => chooseType("lookalike")} />
      </div>

      {err && (
        <Callout tone="error">
          {err.error}{" "}
          {err.termsUrl && (
            <a href={err.termsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold underline">
              Accept terms <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </Callout>
      )}

      {a.type !== "core" && (
        <div className="flex flex-col gap-4 rounded-card bg-lavender-soft p-4 sm:p-5">
          <p className="text-[13px] text-ink-muted">
            Your areas, age and gender below still apply on top{a.type === "lookalike" ? " — lookalikes work best with wider areas (city-wide or metro)" : ""}.
          </p>
          <AudienceList
            title={a.type === "custom" ? "Target these audiences" : "Target these lookalikes"}
            items={(list ?? []).filter((x) => (a.type === "lookalike" ? x.kind === "lookalike" : x.kind !== "lookalike"))}
            selected={a.include}
            onToggle={(x) => toggle("include", x)}
            loading={pending && list === null}
            onRefresh={load}
            empty={a.type === "custom" ? "No custom audiences yet — create one below." : "No lookalikes yet — create one below."}
          />
          {a.type === "custom" ? (
            <CreateCustom draft={draft} client={client} onCreated={added} onError={setErr} />
          ) : (
            <CreateLookalike draft={draft} sources={(list ?? []).filter((x) => x.kind !== "lookalike")} onCreated={added} onError={setErr} />
          )}
        </div>
      )}

      <details className="rounded-card bg-lavender-soft px-4 py-3" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && list === null && !pending && load()}>
        <summary className="cursor-pointer text-[14px] font-bold">
          Exclude people {a.exclude.length > 0 && <Chip tone="paused">{a.exclude.length} excluded</Chip>}
        </summary>
        <p className="mt-1 text-[13px] text-ink-muted">Skip people who already bought or enquired, so budget goes to new customers.</p>
        <div className="mt-3">
          <AudienceList
            title="Don't show ads to"
            items={(list ?? []).filter((x) => x.kind !== "lookalike")}
            selected={a.exclude}
            onToggle={(x) => toggle("exclude", x)}
            loading={pending && list === null}
            onRefresh={load}
            empty="No audiences to exclude yet. Create a customer list under Custom audience."
          />
        </div>
      </details>
    </div>
  );
}

function AudienceList({
  title,
  items,
  selected,
  onToggle,
  loading,
  onRefresh,
  empty,
}: {
  title: string;
  items: AudienceItem[];
  selected: SelectedAudience[];
  onToggle: (x: AudienceItem) => void;
  loading: boolean;
  onRefresh: () => void;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold">{title}</p>
        <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-muted hover:text-ink">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden /> Refresh
        </button>
      </div>
      {loading ? (
        <p className="text-[13px] text-ink-muted">Loading audiences from Meta…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
          {items.map((x) => {
            const on = selected.some((s) => s.id === x.id);
            return (
              <li key={x.id}>
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-input px-3 py-2 text-[13px] ring-1 ring-inset", on ? "bg-chartreuse-soft ring-ink" : "bg-paper ring-line", !x.usable && "opacity-60")}>
                  <input type="checkbox" className="size-4 accent-lavender-deep" checked={on} disabled={!x.usable} onChange={() => onToggle(x)} />
                  <Users className="size-4 shrink-0 text-lavender-deep" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{x.name}</span>
                    <span className="block truncate text-[12px] text-ink-muted">
                      {KIND_LABEL[x.kind]}
                      {x.size ? ` · ${x.size} people` : ""}
                      {x.status ? ` · ${x.status}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type CustomSource = "customer_list" | "website" | "facebook_page" | "instagram";

function CreateCustom({
  draft,
  client,
  onCreated,
  onError,
}: {
  draft: Draft;
  client?: ClientOption;
  onCreated: (x: AudienceItem) => void;
  onError: (e: Err) => void;
}) {
  const [source, setSource] = useState<CustomSource>("customer_list");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [days, setDays] = useState(30);
  const [urlContains, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cc = PHONE_CC[draft.campaign.currency] ?? "91";
  const parsed = source === "customer_list" && text.trim() ? parseCustomerList(text, cc) : null;
  const hasPixel = Boolean(draft.ad.pixel || client?.hasPixel);
  const defaultName = {
    customer_list: "Customer list",
    website: `Website visitors ${days}d`,
    facebook_page: `Facebook engagers ${days}d`,
    instagram: `Instagram engagers ${days}d`,
  }[source];
  const dayOptions = source === "website" ? [7, 30, 60, 90, 180] : [30, 90, 180, 365];

  const create = () => {
    if (!draft.clientId) return onError({ error: "Choose a client in Start first." });
    onError(null);
    setMsg(null);
    const finalName = name.trim() || `${draft.setup.businessName || "Shryxa"} · ${defaultName}`;
    start(async () => {
      if (source === "customer_list") {
        if (!parsed || parsed.rows.length === 0) return onError({ error: "Paste or upload at least one phone number or email." });
        if (parsed.rows.length > MAX_CUSTOMERS) return onError({ error: `Upload at most ${MAX_CUSTOMERS.toLocaleString()} customers at a time.` });
        const rows = await hashRows(parsed.rows); // hashed here — raw data never leaves the browser
        const r = await createCustomerListAction(draft.clientId!, finalName, rows);
        if (!r.ok) return onError(r);
        setText("");
        setMsg(`Uploaded ${r.uploaded.toLocaleString()} customers. Meta matches them to profiles over the next few hours.`);
        onCreated(r.audience);
      } else {
        const r = await createRuleAudienceAction(draft.clientId!, { name: finalName, source, days, urlContains: urlContains || undefined });
        if (!r.ok) return onError(r);
        setMsg("Audience created. Meta fills it with people from the chosen period.");
        onCreated(r.audience);
      }
      setName("");
    });
  };

  const blocked = (source === "website" && !hasPixel) || (source === "instagram" && !client?.hasInstagram);

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <p className="text-[13px] font-bold">Create a new custom audience</p>
      <Segmented
        label="Custom audience source"
        value={source}
        onChange={(v) => setSource(v)}
        options={[
          { value: "customer_list", label: "Customer list" },
          { value: "website", label: "Website visitors" },
          { value: "facebook_page", label: "Facebook engagers" },
          { value: "instagram", label: "Instagram engagers" },
        ]}
      />

      {source === "customer_list" && (
        <>
          <Field id="cl-text" label="Phone numbers and/or emails" hint={`One customer per line, or upload a CSV. Numbers without a country code get +${cc} added.`}>
            <textarea
              id="cl-text"
              rows={5}
              value={text}
              placeholder={"asha@gmail.com, 98765 43210\nravi@example.in\n+91 99887 76655"}
              onChange={(e) => setText(e.target.value)}
              className={cn(inputClass, "h-auto resize-y bg-paper py-3 font-mono text-[12px]")}
            />
          </Field>
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-pill px-3 py-1.5 text-[13px] font-bold ring-1 ring-ink hover:bg-paper">
            <Upload className="size-4" aria-hidden /> Upload CSV
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
                e.target.value = "";
              }}
            />
          </label>
          {parsed && (
            <p className="text-[13px]">
              <strong>{parsed.rows.length.toLocaleString()}</strong> customers found
              {parsed.skipped ? <span className="text-ink-muted"> · {parsed.skipped} lines skipped (no phone or email)</span> : null}
            </p>
          )}
          <p className="text-[12px] text-ink-muted">🔒 Phones and emails are scrambled (SHA-256 hashed) in your browser before upload — Shryxa and Meta never see the raw list. Meta needs at least ~100 matched people to deliver.</p>
        </>
      )}

      {source !== "customer_list" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ca-days" label={source === "website" ? "Visited in the last" : "Engaged in the last"}>
            <Select id="ca-days" className="bg-paper" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </Field>
          {source === "website" && (
            <Field id="ca-url" label="Page URL contains (optional)" hint="e.g. /pricing — empty = any page">
              <Input id="ca-url" className="bg-paper" value={urlContains} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {source === "website" && !hasPixel && <Callout tone="error">Website visitors need a Meta Pixel. Set one up in Start (website goals) or on the client page.</Callout>}
      {source === "instagram" && !client?.hasInstagram && <Callout tone="error">Connect this client&apos;s Instagram account first.</Callout>}
      {(source === "facebook_page" || source === "instagram") && (
        <p className="text-[12px] text-ink-muted">Includes people who visited your profile, liked, commented, saved, messaged or tapped an ad.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field id="ca-name" label="Audience name">
          <Input id="ca-name" className="bg-paper" value={name} maxLength={80} placeholder={`${draft.setup.businessName || "Shryxa"} · ${defaultName}`} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="button" onClick={create} disabled={pending || blocked} aria-busy={pending}>
          {pending ? "Creating…" : "Create audience"}
        </Button>
      </div>
      {msg && <Callout tone="success">{msg}</Callout>}
    </div>
  );
}

function CreateLookalike({
  draft,
  sources,
  onCreated,
  onError,
}: {
  draft: Draft;
  sources: AudienceItem[];
  onCreated: (x: AudienceItem) => void;
  onError: (e: Err) => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [percent, setPercent] = useState(1);
  const [country, setCountry] = useState<string>(CURRENCY[draft.campaign.currency].countryIso);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const src = sources.find((s) => s.id === sourceId);

  const create = () => {
    if (!draft.clientId || !src) return;
    onError(null);
    setMsg(null);
    start(async () => {
      const r = await createLookalikeAction(draft.clientId!, { name: `Lookalike ${country} ${percent}% · ${src.name}`.slice(0, 80), sourceId, country, percent });
      if (!r.ok) return onError(r);
      setMsg("Lookalike created. Meta builds it in 1–6 hours — you can launch now; delivery starts once it's ready.");
      onCreated(r.audience);
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <p className="text-[13px] font-bold">Create a new lookalike</p>
      {sources.length === 0 ? (
        <p className="text-[13px] text-ink-muted">You need a source first: switch to Custom audience and create a customer list or engagers audience (at least 100 people).</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lal-source" label="Source audience" hint="Your best customers make the best lookalikes. Needs at least 100 people.">
              <Select id="lal-source" className="bg-paper" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Choose a source…</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.size ? ` (${s.size})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="lal-country" label="Country">
              <Select id="lal-country" className="bg-paper" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lal-size" className="text-[13px] font-bold">
              Size: {percent}% of {COUNTRIES.find(([c]) => c === country)?.[1]}
            </label>
            <input id="lal-size" type="range" min={1} max={10} step={1} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="accent-lavender-deep" />
            <div className="flex justify-between text-[12px] text-ink-muted">
              <span>1% · most similar</span>
              <span>10% · widest reach</span>
            </div>
          </div>
          <Button type="button" className="self-start" onClick={create} disabled={pending || !src} aria-busy={pending}>
            {pending ? "Creating…" : "Create lookalike"}
          </Button>
        </>
      )}
      {msg && <Callout tone="success">{msg}</Callout>}
    </div>
  );
}
