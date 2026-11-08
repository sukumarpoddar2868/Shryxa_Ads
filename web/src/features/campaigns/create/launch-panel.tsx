"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { launchDraftAction, type LaunchActionResult } from "../launch-actions";
import type { ClientOption, SectionProps } from "./create-campaign";
import { toLaunchPayload } from "./launch-payload";

/** Review → "Check with Meta" (validate only) and "Launch paused" (creates it). */
export function LaunchPanel({ draft, update, clients, ready }: Pick<SectionProps, "draft" | "update" | "clients"> & { ready: boolean }) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<"validate" | "live" | null>(null);
  const [result, setResult] = useState<LaunchActionResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const client: ClientOption | undefined = clients.find((c) => c.id === draft.clientId);
  const launched = draft.launched;

  const run = (mode: "validate" | "live") => {
    const payload = toLaunchPayload(draft);
    if (!payload) return;
    setConfirming(false);
    setResult(null);
    setRunning(mode);
    start(async () => {
      try {
        const r = await launchDraftAction(payload, mode);
        setResult(r);
        if (r.ok && mode === "live" && r.campaignId) {
          update((d) => ({ ...d, launched: { campaignId: r.campaignId!, adsManagerUrl: r.adsManagerUrl ?? null } }));
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
          <CheckCircle2 className="size-5" aria-hidden /> Campaign created — paused
        </p>
        <p className="text-[14px]">
          Nothing is spending yet. Campaign ID <span className="font-mono text-[13px]">{launched.campaignId}</span>. Turn it on in Meta Ads Manager when you&apos;re ready
          (managing it from Shryxa comes next).
        </p>
        <div className="flex flex-wrap gap-3">
          {launched.adsManagerUrl && (
            <ButtonLink href={launched.adsManagerUrl} target="_blank" rel="noreferrer" variant="secondary">
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

  return (
    <div className="mt-6 flex flex-col gap-4">
      {client && !client.ready && <Callout tone="error">{client.name} needs an ad account and Facebook Page before launching.</Callout>}

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={blocked || pending} aria-busy={running === "validate"} onClick={() => run("validate")}>
          <ShieldCheck className="size-4" aria-hidden />
          {running === "validate" ? "Checking with Meta…" : "Check with Meta"}
        </Button>
        <Button type="button" disabled={blocked || pending} aria-busy={running === "live"} onClick={() => {
            setResult(null);
            setConfirming(true);
          }}>
          {running === "live" ? "Creating on Meta…" : "Launch paused"}
        </Button>
      </div>
      {!ready && <p className="text-[13px] text-ink-muted">Fix the items marked Missing above to enable these.</p>}
      {running === "live" && <p className="text-[13px] text-ink-muted">Uploading media and creating the campaign — this can take up to a minute for videos.</p>}

      {confirming && (
        <div role="alertdialog" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded-card bg-lavender p-5">
          <p id="confirm-title" className="text-[15px] font-extrabold">
            Create this campaign in {client?.adAccountName ?? "the ad account"}?
          </p>
          <p className="text-[14px]">It&apos;s created <strong>paused</strong> — nothing spends until you turn it on. Media is uploaded to Meta now.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => run("live")}>
              Yes, create paused campaign
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
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
        {r.ok ? (r.mode === "validate" ? "Looks good to Meta" : "Created") : r.mode === "validate" ? "Meta found a problem" : "Launch failed"}
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
      {r.note && <p className="mt-2 text-[13px] text-ink-muted">{r.note}</p>}
      {r.cleanup && r.cleanup.length > 0 && (
        <p className="mt-2 text-[13px] text-ink-muted">Cleaned up partial setup on Meta: {r.cleanup.join(" · ")}</p>
      )}
    </div>
  );
}
