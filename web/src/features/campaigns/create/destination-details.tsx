"use client";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { CONVERSION_EVENTS, type ConversionEvent } from "../engine/presets.ts";
import { waLink } from "../whatsapp/links";
import { cleanPhone, isPhone, type Draft } from "./blueprint";
import type { ClientOption, SectionProps } from "./create-campaign";

const EVENT_LABELS: Record<ConversionEvent, string> = {
  PURCHASE: "Purchase",
  INITIATED_CHECKOUT: "Checkout started",
  ADD_TO_CART: "Added to cart",
  LEAD: "Lead (form submitted)",
  COMPLETE_REGISTRATION: "Registration completed",
  CONTACT: "Contact",
  SCHEDULE: "Appointment booked",
};

/** Extra details the chosen destination needs (shown in Start and Creative). */
export function DestinationDetails({
  draft,
  update,
  client,
  websiteError,
}: Pick<SectionProps, "draft" | "update"> & { client?: ClientOption; websiteError?: string }) {
  const dest = draft.ad.destination;
  const objective = draft.objective;
  const setAd = (patch: Partial<Draft["ad"]>) => update((d) => ({ ...d, ad: { ...d.ad, ...patch } }));
  // One website field feeds both the AI (setup.website) and the ad link (ad.url).
  const setWebsite = (v: string) => update((d) => ({ ...d, setup: { ...d.setup, website: v }, ad: { ...d.ad, url: d.ad.destination === "website" ? v : d.ad.url } }));
  const website = (label: string, hint: string, required = false) => (
    <Field id="website" label={required ? label : `${label} (optional)`} error={websiteError} hint={hint}>
      <Input id="website" type="url" placeholder="https://" value={draft.setup.website} aria-invalid={!!websiteError} onChange={(e) => setWebsite(e.target.value)} />
    </Field>
  );
  const phoneBad = (v: string) => (v.trim() && !isPhone(v) ? "Use the full number with country code, e.g. +91 98765 43210" : undefined);

  switch (dest) {
    case "website": {
      const conversions = objective === "OUTCOME_SALES" || objective === "OUTCOME_LEADS";
      return (
        <div className="flex flex-col gap-4">
          {website(conversions ? "Website page" : "Website page", conversions ? "Where people buy or fill your form." : "The page people land on.", true)}
          {conversions && objective && (
            <>
              {client?.hasPixel ? (
                <Callout>
                  Conversions are tracked by your Pixel <strong>{client.pixelName ?? ""}</strong>. We check it&apos;s recording activity before launch.
                </Callout>
              ) : (
                <Callout tone="error">This client has no Pixel connected. Pick one on the client page first.</Callout>
              )}
              <Field id="event" label="Optimise for" hint="The Pixel event that counts as a result. It must fire on your website.">
                <Select id="event" value={draft.ad.conversionEvent} onChange={(e) => setAd({ conversionEvent: e.target.value as ConversionEvent })}>
                  {CONVERSION_EVENTS[objective as "OUTCOME_SALES" | "OUTCOME_LEADS"].map((ev) => (
                    <option key={ev} value={ev}>
                      {EVENT_LABELS[ev]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>
      );
    }
    case "lead_form":
      return website("Website", "Shown as a button on the form's thank-you screen.");
    case "whatsapp":
      return (
        <div className="flex flex-col gap-4">
          <Field
            id="wa"
            label="Your WhatsApp business number"
            error={phoneBad(draft.ad.whatsappNumber)}
            hint="Where leads arrive. Use the number of your WhatsApp Business app, with country code."
          >
            <div className="flex gap-2">
              <Input
                id="wa"
                inputMode="tel"
                placeholder="+91 98765 43210"
                value={draft.ad.whatsappNumber}
                aria-invalid={!!phoneBad(draft.ad.whatsappNumber)}
                onChange={(e) => setAd({ whatsappNumber: e.target.value })}
                onBlur={(e) => isPhone(e.target.value) && setAd({ whatsappNumber: cleanPhone(e.target.value) })}
              />
              <a
                href={isPhone(draft.ad.whatsappNumber) ? waLink(draft.ad.whatsappNumber, "Test from Shryxa Ads") : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!isPhone(draft.ad.whatsappNumber)}
                className={buttonClass({ variant: "secondary" }, !isPhone(draft.ad.whatsappNumber) ? "pointer-events-none opacity-50" : undefined)}
              >
                Test
              </a>
            </div>
          </Field>
          <Callout>
            <strong>One-time setup:</strong> link this number to the client&apos;s Facebook Page (Page settings → Linked accounts → WhatsApp). Meta uses that link for chat ads. You
            set the greeting and the customer&apos;s message in <strong>Creative</strong>.
          </Callout>
          {website("Website", "Helps the AI write better copy.")}
        </div>
      );
    case "call":
      return (
        <div className="flex flex-col gap-4">
          <Field id="phone" label="Phone number to call" error={phoneBad(draft.ad.phone)} hint="With country code. Call ads show on phones only.">
            <Input
              id="phone"
              inputMode="tel"
              placeholder="+91 98765 43210"
              value={draft.ad.phone}
              aria-invalid={!!phoneBad(draft.ad.phone)}
              onChange={(e) => setAd({ phone: e.target.value })}
              onBlur={(e) => isPhone(e.target.value) && setAd({ phone: cleanPhone(e.target.value) })}
            />
          </Field>
          {website("Website", "Helps the AI write better copy.")}
        </div>
      );
    case "messenger":
      return (
        <div className="flex flex-col gap-4">
          <Callout>Tapping opens a Messenger chat with {client?.pageName ?? "the Facebook Page"}. Reply from the Page inbox or Meta Business Suite.</Callout>
          {website("Website", "Helps the AI write better copy.")}
        </div>
      );
    case "instagram_dm":
      return (
        <div className="flex flex-col gap-4">
          <Callout>
            Tapping opens a DM with {client?.instagramUsername ? `@${client.instagramUsername}` : "the Instagram account"}. Instagram message access must be allowed in its
            settings.
          </Callout>
          {website("Website", "Helps the AI write better copy.")}
        </div>
      );
    case "none":
      return website("Website", "Optional “Learn more” link. Without one, the ad links to the Facebook Page.");
  }
}
