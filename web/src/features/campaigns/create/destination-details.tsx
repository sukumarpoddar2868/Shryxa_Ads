"use client";


import { ExternalLink } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { CONVERSION_EVENTS, type ConversionEvent } from "../engine/presets.ts";
import { waLink } from "../whatsapp/links";
import { PixelSetup } from "./pixel-setup";
import { cleanPhone, isPhone, type Draft } from "./blueprint";
import type { ClientOption, SectionProps } from "./create-campaign";

/** Where a Page links its WhatsApp number (needed for click-to-WhatsApp ads). */
const LINK_WHATSAPP = {
  businessSuite: (pageId: string) => `https://business.facebook.com/latest/settings/whatsapp_account?asset_id=${pageId}`,
  facebook: "https://www.facebook.com/settings/?tab=linked_whatsapp",
};

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
          {website("Website page", conversions ? "Where people buy or fill your form." : "The page people land on.", true)}
          {conversions && objective && (
            <Field id="event" label="Optimise for" hint="The Pixel event that counts as a result. It must fire on your website.">
              <Select id="event" value={draft.ad.conversionEvent} onChange={(e) => setAd({ conversionEvent: e.target.value as ConversionEvent })}>
                {CONVERSION_EVENTS[objective as "OUTCOME_SALES" | "OUTCOME_LEADS"].map((ev) => (
                  <option key={ev} value={ev}>
                    {EVENT_LABELS[ev]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <PixelSetup draft={draft} update={update} required={conversions} />
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
            <strong>One-time setup:</strong> link this number to {client?.pageName ? <strong>{client.pageName}</strong> : "the Facebook Page"} — Meta needs that link for WhatsApp ads.
            You set the greeting and the customer&apos;s message in <strong>Creative</strong>.
            <span className="mt-3 flex flex-wrap gap-2">
              {client?.pageId && (
                <a href={LINK_WHATSAPP.businessSuite(client.pageId)} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
                  Link in Business Suite <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
              <a href={LINK_WHATSAPP.facebook} target="_blank" rel="noreferrer" className={buttonClass({ variant: "ghost", size: "sm" })}>
                Page settings on Facebook <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </span>
          </Callout>
          {website("Website", "Helps the AI write better copy.")}
        </div>
      );
    case "call":
      return (
        <div className="flex flex-col gap-4">
          <Field id="phone" label="Phone number to call" error={phoneBad(draft.ad.phone)} hint="With country code. Call ads show on phones only — make sure someone answers during business hours.">
            <div className="flex gap-2">
            <Input
              id="phone"
              inputMode="tel"
              placeholder="+91 98765 43210"
              value={draft.ad.phone}
              aria-invalid={!!phoneBad(draft.ad.phone)}
              onChange={(e) => setAd({ phone: e.target.value })}
              onBlur={(e) => isPhone(e.target.value) && setAd({ phone: cleanPhone(e.target.value) })}
            />
              <a
                href={isPhone(draft.ad.phone) ? `tel:${cleanPhone(draft.ad.phone)}` : undefined}
                aria-disabled={!isPhone(draft.ad.phone)}
                className={buttonClass({ variant: "secondary" }, !isPhone(draft.ad.phone) ? "pointer-events-none opacity-50" : undefined)}
              >
                Test call
              </a>
            </div>
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
    case "instagram_profile":
      return (
        <div className="flex flex-col gap-4">
          {client?.hasInstagram ? (
            <Callout>
              Tapping <strong>View Instagram profile</strong> opens {client.instagramUsername ? `@${client.instagramUsername}` : "the Instagram account"}. Meta optimises for profile visits — great
              for growing followers. Runs on Instagram only.
            </Callout>
          ) : (
            <Callout tone="error">Connect this client&apos;s Instagram account first (client page → assets).</Callout>
          )}
          <p className="text-[12px] text-ink-muted">Meta is still rolling this out — if the ad account doesn&apos;t have it yet, Meta says so when you click “Check with Meta” or launch.</p>
          {website("Website", "Helps the AI write better copy.")}
        </div>
      );
    case "none":
      return website("Website", "Optional “Learn more” link. Without one, the ad links to the Facebook Page.");
  }
}
