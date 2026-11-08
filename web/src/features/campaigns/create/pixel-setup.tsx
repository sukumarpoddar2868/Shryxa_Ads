"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2, CircleAlert, Copy, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout, Chip } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import type { PixelOption } from "@/features/meta-connect/discovery";
import { checkPixelAction, createPixelAction, listPixelsAction, selectPixelAction, type PixelCheck } from "../pixel/actions";
import { PLATFORM_TIPS, STANDARD_EVENT, baseCode, eventCode, onSubmitCode } from "../pixel/snippets";
import type { SectionProps } from "./create-campaign";

/**
 * Website goals: pick/create the client's Meta Pixel, copy the install code
 * for this goal, and check it's installed (website scan + Meta activity).
 */
export function PixelSetup({ draft, update, required }: Pick<SectionProps, "draft" | "update"> & { required: boolean }) {
  const pixel = draft.ad.pixel;
  const clientId = draft.clientId;
  const conversions = draft.objective === "OUTCOME_SALES" || draft.objective === "OUTCOME_LEADS";
  const event = draft.ad.conversionEvent;

  const [mode, setMode] = useState<"idle" | "choose" | "create">("idle");
  const [pixels, setPixels] = useState<PixelOption[] | null>(null);
  const [name, setName] = useState(`${draft.setup.businessName || "Website"} Pixel`.slice(0, 60));
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<PixelCheck | null>(null);
  const [pending, start] = useTransition();
  const [codeTab, setCodeTab] = useState<"base" | "event" | "submit">("base");

  const setPixel = (p: PixelOption) => update((d) => ({ ...d, ad: { ...d.ad, pixel: { id: p.id, name: p.name } } }));

  const choose = () => {
    if (!clientId) return setError("Choose a client first.");
    setError(null);
    setMode("choose");
    start(async () => {
      const r = await listPixelsAction(clientId);
      if (!r.ok) return setError(r.error);
      setPixels(r.pixels);
      if (r.pixels.length === 0) setMode("create");
    });
  };

  const pick = (id: string) =>
    start(async () => {
      if (!clientId || !id) return;
      const r = await selectPixelAction(clientId, id);
      if (!r.ok) return setError(r.error);
      setPixel(r.pixel);
      setMode("idle");
      setCheck(null);
    });

  const create = () =>
    start(async () => {
      if (!clientId) return;
      setError(null);
      const r = await createPixelAction(clientId, name);
      if (!r.ok) return setError(r.error);
      setPixel(r.pixel);
      setMode("idle");
      setCheck(null);
    });

  const runCheck = () =>
    start(async () => {
      if (!clientId || !pixel) return;
      setError(null);
      setCheck(await checkPixelAction(clientId, pixel.id, draft.ad.url || draft.setup.website));
    });

  const code = !pixel ? "" : codeTab === "base" ? baseCode(pixel.id) : codeTab === "event" ? eventCode(event, draft.campaign.currency) : onSubmitCode(event);

  return (
    <div className="flex flex-col gap-4 rounded-card bg-lavender-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold">Meta Pixel {required ? "" : "(recommended)"}</p>
          <p className="text-[13px] text-ink-muted">
            {conversions
              ? `Counts ${STANDARD_EVENT[event] ?? "conversions"} on your website so Meta can find people who convert.`
              : "Measures visits from your ad so you can see what people do on your site."}
          </p>
        </div>
        <Chip tone={pixel ? "active" : required ? "stopped" : "neutral"}>{pixel ? "Pixel selected" : required ? "Pixel needed" : "Optional"}</Chip>
      </div>

      {error && <Callout tone="error">{error}</Callout>}

      {/* Which Pixel */}
      {pixel && mode === "idle" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-input bg-paper px-3 py-2 text-[14px]">
          <span>
            <strong>{pixel.name}</strong> <span className="text-ink-muted">· ID {pixel.id}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={choose} disabled={pending}>
            Change
          </Button>
        </div>
      ) : mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={choose} disabled={pending}>
            Choose existing Pixel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setMode("create");
            }}
          >
            <Plus className="size-4" aria-hidden /> Create a new Pixel
          </Button>
        </div>
      ) : null}

      {mode === "choose" && (
        <div className="flex flex-col gap-2">
          {pending && !pixels ? (
            <p className="text-[13px] text-ink-muted">Loading Pixels from Meta…</p>
          ) : (
            <Field id="pixel-pick" label="Pixels in this ad account">
              <Select id="pixel-pick" className="bg-paper" defaultValue="" onChange={(e) => pick(e.target.value)} disabled={pending}>
                <option value="">Choose a Pixel…</option>
                {(pixels ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.id}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("create")}>
              <Plus className="size-4" aria-hidden /> Create a new one instead
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "create" && (
        <div className="flex flex-col gap-2">
          <Field id="pixel-name" label="New Pixel name" hint="Created in the client's ad account. You only need one Pixel per website.">
            <Input id="pixel-name" className="bg-paper" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create Pixel"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Install code */}
      {pixel && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold">Install code</p>
          <div role="tablist" aria-label="Pixel code" className="flex flex-wrap gap-1">
            {(
              [
                ["base", "1 · Every page (head)"],
                ...(conversions ? ([["event", `2 · Thank-you page`], ["submit", "or: on form submit"]] as const) : []),
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={codeTab === id}
                onClick={() => setCodeTab(id)}
                className={cn("rounded-pill px-3 py-1 text-[12px] font-bold", codeTab === id ? "bg-ink text-paper" : "bg-paper text-ink-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-ink-muted">
            {codeTab === "base"
              ? "Paste inside <head> on every page of the website. This also counts visits (PageView)."
              : codeTab === "event"
                ? `Paste on the page people see after ${draft.objective === "OUTCOME_SALES" ? "buying" : "submitting your form"} — below the base code.`
                : "Use this instead if your form doesn't go to a separate thank-you page."}
          </p>
          <CodeBlock code={code} />

          <details className="rounded-input bg-paper px-3 py-2 text-[13px]">
            <summary className="cursor-pointer font-bold">Using WordPress, Shopify, Wix or Squarespace?</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {PLATFORM_TIPS.map((t) => (
                <li key={t.name}>
                  <strong>{t.name}:</strong> <span className="text-ink-muted">{t.steps}</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={runCheck} disabled={pending} aria-busy={pending}>
              <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden /> Check installation
            </Button>
            <span className="text-[12px] text-ink-muted">Scans {draft.ad.url || draft.setup.website || "your website"} and asks Meta for recent activity.</span>
          </div>
          {check && <CheckResult check={check} event={conversions ? (STANDARD_EVENT[event] ?? null) : null} />}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded-input bg-ink p-3 pr-20 text-[11px] leading-relaxed text-paper">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // clipboard blocked — the user can still select the text
          }
        }}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-pill bg-paper px-2.5 py-1 text-[12px] font-bold text-ink"
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ago(mins: number): string {
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function CheckResult({ check, event }: { check: PixelCheck; event: string | null }) {
  if (!check.ok) return <Callout tone="error">{check.error}</Callout>;
  const fresh = check.fresh;
  const row = (ok: boolean | null, text: string) => (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-tomato-700" aria-hidden />}
      <span>{text}</span>
    </li>
  );
  return (
    <ul role="status" className={cn("flex flex-col gap-1.5 rounded-input p-3 text-[13px]", fresh ? "bg-chartreuse-soft" : "bg-paper")}>
      {check.error
        ? row(false, `Meta activity not checked: ${check.error}`)
        : row(fresh, check.minutesAgo !== null ? `Meta last received an event ${ago(check.minutesAgo)}.` : "Meta hasn't received any events from this Pixel yet.")}
      {check.site &&
        (check.site.reachable ? (
          <>
            {row(check.site.hasThisPixel, check.site.hasThisPixel ? "This Pixel's code is on the page." : check.site.hasBaseCode ? "Pixel code found, but with a different Pixel ID." : "Pixel code not found on the page.")}
            {event && row(check.site.events.includes(event), check.site.events.includes(event) ? `“${event}” event found on this page.` : `“${event}” isn't on this page — it belongs on the thank-you page, so that's expected here.`)}
            {check.site.note && <li className="text-ink-muted">{check.site.note}</li>}
          </>
        ) : (
          row(false, `Website check skipped: ${check.site.note}`)
        ))}
      {!fresh && <li className="text-ink-muted">After installing, open your website once, then check again. Launching website conversions needs activity in the last 30 days.</li>}
    </ul>
  );
}
