"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { CURRENCIES, CURRENCY } from "../engine/presets.ts";
import { generateSetupAction } from "../ai/actions";
import { REACH_SCOPES, SCOPE_INFO } from "../ai/prompts.ts";
import { DESTINATIONS_FOR, OBJECTIVE_OPTIONS, defaultDestination, type ObjectiveId } from "./blueprint";
import type { SectionProps } from "./create-campaign";
import { ChipInput, ChoiceCard, Group, Header, Planned, Segmented, TextArea, set } from "./sections";

/**
 * Start: goal (objective) → destination → about the business → customers →
 * AI drafts the whole campaign. Every AI-filled field stays editable later.
 */
export function StartSection({ draft, update, clients, isAgency, goTo }: SectionProps & { isAgency: boolean }) {
  const s = draft.setup;
  const client = clients.find((c) => c.id === draft.clientId);
  const objective = OBJECTIVE_OPTIONS.find((o) => o.id === draft.objective);
  const destinations = draft.objective === "OUTCOME_LEADS" || draft.objective === "OUTCOME_TRAFFIC" ? DESTINATIONS_FOR[draft.objective] : [];
  const destination = draft.ad.destination;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const fe = (k: string) => fieldErrors[k];

  const chooseObjective = (id: ObjectiveId | "") =>
    update((d) => ({
      ...d,
      objective: id || null,
      ad: id ? { ...d.ad, destination: defaultDestination(id), cta: id === "OUTCOME_TRAFFIC" ? "LEARN_MORE" : "GET_QUOTE" } : d.ad,
    }));

  const generate = () => {
    if (!draft.objective || !draft.clientId) return;
    setError(null);
    setFieldErrors({});
    setNotice(null);
    const objectiveId = draft.objective as "OUTCOME_LEADS" | "OUTCOME_TRAFFIC";
    start(async () => {
      const r = await generateSetupAction({
        clientId: draft.clientId!,
        objective: objectiveId,
        businessName: s.businessName,
        website: s.website.trim(),
        about: s.about,
        offer: s.offer,
        cities: s.cities,
        scope: s.scope,
        currency: draft.campaign.currency,
        idealCustomer: s.idealCustomer.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        return;
      }
      const c = r.copy;
      update((d) => ({
        ...d,
        generated: true,
        campaign: { ...d.campaign, name: c.campaign_name, amount: String(c.daily_budget), budgetType: "daily" },
        audience: {
          ...d.audience,
          locations: r.pins.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, radiusKm: p.radius_km, why: p.why })),
          ageMin: c.age_min,
          ageMax: c.age_max,
          gender: c.gender,
          interests: c.interest_targeting,
          mode: "strict",
          device: c.device_os,
          why: c.audience_why,
        },
        // Meta allows phone targeting only with manual placements.
        placements: c.device_os === "all" ? { ...d.placements, mode: "advantage" } : { mode: "manual", facebook: true, instagram: true },
        ad: {
          ...d.ad,
          url: d.ad.destination === "website" ? s.website.trim() : d.ad.url,
          primaryText: c.primary_text,
          headline: c.headline,
          description: c.description ?? "",
          cta: c.call_to_action,
        },
      }));
      setNotice(
        r.usedFallback
          ? "The AI was busy, so we drafted simple copy from your description. Everything else is filled — review and edit."
          : `Done — ${r.pins.length} area${r.pins.length === 1 ? "" : "s"}, budget, audience and ad text are filled in. Review each step and edit anything.`,
      );
    });
  };

  return (
    <>
      <Header
        level="Start"
        title="What do you want, and from whom?"
        blurb="Pick your goal, describe the business, and AI fills in the whole campaign — name, budget, areas, audience and ad text. You can edit every field after."
      />
      <div className="flex flex-col gap-6">
        {/* 1. Goal → destination: first, so the AI writes for it */}
        <Group title="Campaign goal" hint="Meta optimises delivery for this goal. It can't be changed after launch.">
          <Field id="objective" label="Objective" hint={objective?.blurb}>
            <Select id="objective" value={draft.objective ?? ""} onChange={(e) => chooseObjective(e.target.value as ObjectiveId | "")}>
              <option value="">Choose a goal…</option>
              {OBJECTIVE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.available}>
                  {o.label}
                  {o.note ? ` — ${o.note}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {destinations.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold">Where should people go?</span>
              <div role="radiogroup" aria-label="Destination" className="grid gap-3 sm:grid-cols-2">
                {destinations.map((o) => (
                  <ChoiceCard
                    key={o.id}
                    title={o.label}
                    blurb={o.blurb}
                    badge={o.note}
                    disabled={!o.available}
                    selected={o.available && destination === o.id}
                    onSelect={() => o.id !== "whatsapp" && o.id !== "call" && set(update, "ad", { destination: o.id })}
                  />
                ))}
              </div>
            </div>
          )}

          {draft.objective && (
            <Field
              id="website"
              label={destination === "website" ? "Website page" : "Website (optional)"}
              error={fe("website")}
              hint={destination === "website" ? "The page people land on." : "Shown on the form's thank-you screen."}
            >
              <Input id="website" type="url" placeholder="https://" value={s.website} aria-invalid={!!fe("website")} onChange={(e) => set(update, "setup", { website: e.target.value })} />
            </Field>
          )}
        </Group>

        {/* 2. About the business */}
        <Group title="About the business">
          {clients.length === 0 ? (
            <Callout>
              No client is connected to Facebook yet.{" "}
              <Link href="/clients" className="font-bold text-tomato-700 hover:underline">
                Connect one →
              </Link>
            </Callout>
          ) : (
            isAgency && (
              <Field id="client" label="Client">
                <Select
                  id="client"
                  value={draft.clientId ?? ""}
                  onChange={(e) => {
                    const next = clients.find((c) => c.id === Number(e.target.value));
                    update((d) => ({ ...d, clientId: next?.id ?? null, setup: { ...d.setup, businessName: next?.name ?? d.setup.businessName } }));
                  }}
                >
                  <option value="">Choose a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.ready ? "" : " (setup needed)"}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          )}
          {client && (
            <dl className="grid gap-2 rounded-card bg-lavender-soft p-4 text-[14px] sm:grid-cols-3">
              {[
                ["Ad account", client.adAccountName],
                ["Facebook Page", client.pageName],
                ["Instagram", client.instagramUsername ? `@${client.instagramUsername}` : null],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] font-bold text-ink-muted">{k}</dt>
                  <dd className={v ? "font-bold" : "text-ink-muted"}>{v ?? "Not set"}</dd>
                </div>
              ))}
            </dl>
          )}
          {client && !client.ready && (
            <Callout tone="error">
              This client needs an ad account and Page before launch.{" "}
              <Link href={`/clients/${client.id}`} className="font-bold underline">
                Finish setup →
              </Link>
            </Callout>
          )}
          <Field id="businessName" label="Business name" error={fe("businessName")}>
            <Input id="businessName" value={s.businessName} aria-invalid={!!fe("businessName")} onChange={(e) => set(update, "setup", { businessName: e.target.value })} />
          </Field>
          <Field id="about" label="What does the business do?" error={fe("about")} hint="Services, who the customers are, what makes it different.">
            <TextArea
              id="about"
              max={2000}
              rows={4}
              value={s.about}
              onChange={(v) => set(update, "setup", { about: v })}
              placeholder="e.g. Bangalore CA firm with 15 years' experience. ITR filing, GST and tax planning for salaried people and small businesses."
            />
          </Field>
          <Field id="offer" label="What does this campaign promote?" error={fe("offer")} hint="The specific offer, price or deadline.">
            <TextArea
              id="offer"
              max={2000}
              rows={3}
              value={s.offer}
              onChange={(v) => set(update, "setup", { offer: v })}
              placeholder="e.g. ITR filing for FY 2025-26 from ₹999. Deadline 31 July — avoid the ₹5,000 late fee."
            />
          </Field>
          <Field
            id="idealCustomer"
            label="Describe your ideal customer (optional)"
            error={fe("idealCustomer")}
            hint="AI uses this for age, gender, phone type and interests. Mention iPhone or Android to target by phone."
          >
            <TextArea
              id="idealCustomer"
              max={1000}
              rows={2}
              value={s.idealCustomer}
              onChange={(v) => set(update, "setup", { idealCustomer: v })}
              placeholder="e.g. Salaried professionals 28–45 with iPhones, mostly working in IT parks."
            />
          </Field>
        </Group>

        {/* 3. Customers */}
        <Group title="Where are your customers?">
          <Field id="cities" label="Target cities" error={fe("cities")}>
            <ChipInput id="cities" values={s.cities} onChange={(v) => set(update, "setup", { cities: v })} placeholder="e.g. Bangalore" />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">How wide?</span>
            <Segmented
              label="Reach scope"
              value={s.scope}
              onChange={(v) => set(update, "setup", { scope: v })}
              options={REACH_SCOPES.map((x) => ({ value: x, label: SCOPE_INFO[x].label }))}
            />
            <p className="text-[13px] text-ink-muted">{SCOPE_INFO[s.scope].blurb}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">Currency</span>
            <Segmented
              label="Currency"
              value={draft.campaign.currency}
              onChange={(v) => set(update, "campaign", { currency: v, amount: String(CURRENCY[v].defaultDailyBudget) })}
              options={CURRENCIES.map((x) => ({ value: x, label: `${CURRENCY[x].symbol} ${x}` }))}
            />
          </div>
        </Group>

        {/* 4. Generate */}
        <div className="flex flex-col gap-3 rounded-card bg-lavender-soft p-5">
          <p className="text-[14px] text-ink-muted">
            {!client ? (
              "Choose a client first."
            ) : !objective ? (
              "Choose a campaign goal first."
            ) : (
              <>
                Building a <strong className="text-ink">{objective.label}</strong> campaign for <strong className="text-ink">{client.name}</strong>.
                {draft.generated && " Generating again replaces the AI-filled fields, including your edits."}
              </>
            )}
          </p>
          {error && <Callout tone="error">{error}</Callout>}
          {notice && <Callout tone="success">{notice}</Callout>}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={generate} disabled={pending || !objective || !client} aria-busy={pending}>
              <Sparkles className="size-4" aria-hidden />
              {pending ? "Building your campaign…" : draft.generated ? "Generate again" : "Generate campaign with AI"}
            </Button>
            {draft.generated && !pending && (
              <Button type="button" variant="secondary" onClick={() => goTo("name-budget")}>
                Review campaign <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
      <Planned id="start" />
    </>
  );
}
