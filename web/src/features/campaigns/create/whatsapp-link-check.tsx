"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { whatsappLinkStatusAction, type WhatsAppLinkStatus } from "../whatsapp/link-status";

/** Page → Linked accounts → WhatsApp (needed for click-to-WhatsApp ads). */
const LINK_WHATSAPP = "https://www.facebook.com/settings/?tab=linked_whatsapp";

/**
 * Number input + "Test": asks Meta whether this number is the WhatsApp
 * number linked to the client's Facebook Page. Not linked → connect button.
 * After a test, rechecks when the person returns from the Facebook tab.
 */
export function WhatsAppLinkCheck({ clientId, pageName, number, valid, children }: { clientId: number | null; pageName: string | null; number: string; valid: boolean; children: ReactNode }) {
  const key = `${clientId}:${number}`;
  const [result, setResult] = useState<{ key: string; status: WhatsAppLinkStatus } | null>(null);
  const [pending, start] = useTransition();

  const test = () => {
    if (!valid || !clientId) return;
    start(async () => setResult({ key, status: await whatsappLinkStatusAction(clientId, number) }));
  };

  const tested = result?.key === key;
  useEffect(() => {
    if (!tested || result?.status.state === "linked" || !clientId) return;
    const again = async () => {
      if (document.visibilityState !== "visible") return;
      setResult({ key, status: await whatsappLinkStatusAction(clientId, number) });
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [tested, result?.status.state, clientId, number, key]);

  const status = tested ? result.status : null;
  const page = pageName ?? "your Facebook Page";

  return (
    <>
      <div className="flex gap-2">
        {children}
        <Button type="button" variant="secondary" onClick={test} disabled={!valid || !clientId || pending}>
          {pending ? "Testing…" : "Test"}
        </Button>
      </div>
      {status?.state === "linked" && (
        <p role="status" className="flex items-center gap-2 text-[14px] font-bold">
          <CheckCircle2 className="size-4 text-lavender-deep" aria-hidden /> Linked to {page}
        </p>
      )}
      {status && status.state !== "linked" && (
        <div role="status" className="flex flex-col items-start gap-2">
          {status.state === "unknown" ? (
            <p className="text-[14px] text-ink-muted">
              Meta didn&apos;t confirm the link. Already connected it? You&apos;re set — <strong className="text-ink">Pause</strong> on the Review step will confirm (if it isn&apos;t linked, Meta rejects it and nothing is created). If not, connect it now:
            </p>
          ) : (
            <p className="text-[14px] text-tomato-700">
              {status.state === "other" ? `${page} is linked to a different number (${status.linked}).` : `Not linked to ${page} yet.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <a href={LINK_WHATSAPP} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
              Click Here To Connect WhatsApp <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <p className="text-[13px] text-ink-muted">
              Facebook → switch to <strong className="text-ink">{page}</strong> → Settings → Linked accounts → WhatsApp → Connect
            </p>
          </div>
        </div>
      )}
    </>
  );
}
