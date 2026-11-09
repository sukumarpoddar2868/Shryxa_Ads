"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Pause, Rocket, ShieldCheck, XCircle } from "lucide-react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { CURRENCY } from "../engine/presets.ts";
import { launchDraftAction, type LaunchActionResult } from "../launch-actions";
import type { ClientOption, SectionProps } from "./create-campaign";
import { toLaunchPayload } from "./launch-payload";

type Launch = "ACTIVE" | "PAUSED";

/**
 * Review → "Check with Meta" (validate only, creates nothing), "Launch"
 * (created switched on — spends after Meta's ad review) and "Pause"
 * (created switched off). Both create steps ask for confirmation.
 */
export function LaunchPanel({ draft, update, clients, ready, draftId }: Pick<SectionProps, "draft" | "update" | "clients" | "draftId"> & { ready: boolean }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<"validate" | Launch | null>(null);
  const [result, setResult] = useState<LaunchActionResult | null>(null);
  const [confirming, setConfirming] = useState<Launch | null>(null);
  const client: ClientOption | undefined = clients.find((c) => c.id === draft.clientId);
  const launched = draft.launched;
  const sym = CURRENCY[draft.campaign.currency]?.symbol ?? "";
  const budget = `${sym}${Number(draft.campaign.amount || 0).toLocaleString("en-IN")} ${draft.campaign.budgetType === "daily" ? "per day" : "in total"}`;

  const run = (mode: "validate" | "live", status: Launch = "PAUSED") => {
    const payload = toLaunchPayload(draft);
    if (!payload) return;
    setConfirming(null);
    setResult(null);
    setRunning(mode === "validate" ? "validate" : status);
    start(async () => {
      try {
        const r = await launchDraftAction(payload, mode, draftId, status);
        setResult(r);
        if (r.ok && mode === "live" && r.campaignId) {
          update((d) => ({ ...d, launched: { campaignId: r.campaignId!, adsManagerUrl: r.adsManagerUrl ?? null, active: Boolean(r.active) } }));
        }
      } catch {
        setResult({ ok: false, mode, message: "Something went wrong talking to the server. Please try again.", steps: [] });
      } finally {
        setRunning(null);
      }
    });
  };

  if (launched) {
    return (
      <div className="mt-6 flex flex-col gap-3 rounded-card bg-chartreuse-soft p-5">
        <p className="flex items-center gap-2 text-[16px] font-extrabold">
          <CheckCircle2 className="size-5" aria-hidden /> {launched.active ? "Campaign launched — in Meta review" : "Campaign created — paused"}
        </p>
        <p className="text-[14px]">
          {launched.active
            ? "Meta reviews the ad first (usually minutes, up to 24 hours) and it starts spending once approved. Pause it any time from Campaigns."
            : "Nothing is spending. Turn it on from Campaigns when you're ready."}{" "}
          Campaign ID <span className="font-mono text-[13px]">{launched.campaignId}</span>.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/campaigns" variant="secondary">
            Go to Campaigns
          </ButtonLink>
          {launched.adsManagerUrl && (
            <ButtonLink href={launched.adsManagerUrl} target="_blank" rel="noreferrer" variant="ghost">
              Open in Ads Manager <ExternalLink className="size-4" aria-hidden />
            </ButtonLink>
          )}
          {/* Full reload so the form starts empty. */}
          <a href="/campaigns/new" className={buttonClass({ variant: "ghost" })}>
            Create another campaign
          </a>
        </div>
      </div>
    );
  }

  const blocked = !ready || !client?.ready;
  const ask = (s: Launch) => {
    setResult(null);
    setConfirming(s);
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      {client && !client.ready && <Callout tone="error">{client.name} needs an ad account and Facebook Page before launching.</Callout>}

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={blocked || pending} aria-busy={running === "validate"} onClick={() => run("validate")}>
          <ShieldCheck className="size-4" aria-hidden />
          {running === "validate" ? "Checking with Meta…" : "Check with Meta"}
        </Button>
        <Button type="button" disabled={blocked || pending} aria-busy={running === "ACTIVE"} onClick={() => ask("ACTIVE")}>
          <Rocket className="size-4" aria-hidden />
          {running === "ACTIVE" ? "Launching…" : "Launch"}
        </Button>
        <Button type="button" variant="secondary" disabled={blocked || pending} aria-busy={running === "PAUSED"} onClick={() => ask("PAUSED")}>
          <Pause className="size-4" aria-hidden />
          {running === "PAUSED" ? "Creating paused…" : "Pause"}
        </Button>
      </div>
      <p className="text-[13px] text-ink-muted">
        <strong className="text-ink">Check with Meta</strong> tests the settings, creates nothing. <strong className="text-ink">Launch</strong> goes live after Meta&apos;s ad review.{" "}
        <strong className="text-ink">Pause</strong> creates it switched off — turn it on later from Campaigns.
      </p>
      {!ready && <p className="text-[13px] text-ink-muted">Fix the items marked Missing above to enable these.</p>}
      {running && running !== "validate" && <p className="text-[13px] text-ink-muted">Uploading media and creating the campaign — this can take up to a minute for videos.</p>}

      {confirming && (
        <div role="alertdialog" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded-card bg-lavender p-5">
          <p id="confirm-title" className="text-[15px] font-extrabold">
            {confirming === "ACTIVE" ? "Launch" : "Create paused"} in {client?.adAccountName ?? "the ad account"}?
          </p>
          <p className="text-[14px]">
            {confirming === "ACTIVE" ? (
              <>
                It goes <strong>live</strong> after Meta&apos;s ad review and can spend up to <strong>{budget}</strong>. You can pause it any time from Campaigns.
              </>
            ) : (
              <>
                It&apos;s created <strong>paused</strong> — nothing spends until you turn it on.
              </>
            )}{" "}
            Media is uploaded to Meta now.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => run("live", confirming)}>
              {confirming === "ACTIVE" ? `Yes, launch · ${budget}` : "Yes, create paused"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {result && <ResultView r={result} />}
    </div>
  );
}

function ResultView({ r }: { r: LaunchActionResult }) {
  return (
    <div role="status" className={r.ok ? "rounded-card bg-chartreuse-soft p-5" : "rounded-card bg-tomato-soft p-5"}>
      <p className="flex items-center gap-2 text-[15px] font-extrabold">
        {r.ok ? <CheckCircle2 className="size-5" aria-hidden /> : <XCircle className="size-5 text-tomato-700" aria-hidden />}
        {r.ok ? (r.mode === "validate" ? "Looks good to Meta" : r.active ? "Launched" : "Created — paused") : r.mode === "validate" ? "Meta found a problem" : "Launch failed"}
      </p>
      <p className="mt-1 text-[14px]">{r.message}</p>
      {r.issues && r.issues.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-[14px]">
          {r.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {r.steps.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1 text-[13px]">
          {r.steps.map((s, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <strong>{s.label}:</strong>
              {s.error ? <span className="text-tomato-700">{s.error}</span> : <span>{s.id ? `OK · ${s.id}` : r.mode === "validate" ? "accepted" : "skipped"}</span>}
            </li>
          ))}
        </ol>
      )}
      {r.fix && (
        <div className="mt-3 flex flex-col items-start gap-2 rounded-card bg-paper p-4">
          <p className="text-[14px] font-extrabold">{r.fix.title}</p>
          <p className="text-[14px]">{r.fix.body}</p>
          <a href={r.fix.url} target="_blank" rel="noreferrer" className={buttonClass({ size: "sm" })}>
            {r.fix.label} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      )}
      {r.note && <p className="mt-2 text-[13px] text-ink-muted">{r.note}</p>}
      {r.cleanup && r.cleanup.length > 0 && (
        <p className="mt-2 text-[13px] text-ink-muted">Cleaned up partial setup on Meta: {r.cleanup.join(" · ")}</p>
      )}
    </div>
  );
}
