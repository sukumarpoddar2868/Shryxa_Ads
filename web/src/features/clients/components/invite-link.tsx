"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Mail, MessageCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { createInviteAction, type InviteState } from "../actions";

/** Generates a 7-day magic link the client opens to connect their own Facebook. */
export function InviteLink({ clientId, businessName }: { clientId: number; businessName: string }) {
  const [state, setState] = useState<InviteState>({});
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      setCopied(false);
      setState(await createInviteAction(clientId));
    });

  const copy = async () => {
    if (!state.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const message = state.url
    ? `Hi! To run ads for ${businessName}, please connect your Facebook here (takes a minute): ${state.url}`
    : "";

  if (!state.url) {
    return (
      <div className="flex flex-col gap-3">
        <Button variant="secondary" onClick={generate} disabled={pending} className="self-start">
          <Link2 className="size-4" aria-hidden /> {pending ? "Creating link…" : "Create invite link"}
        </Button>
        {state.error && <Callout tone="error">{state.error}</Callout>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-input bg-lavender-soft p-1.5 pl-4">
        <code className="min-w-0 flex-1 truncate text-[13px]">{state.url}</code>
        <Button size="sm" variant={copied ? "invert" : "primary"} onClick={copy} aria-live="polite">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={buttonClass({ variant: "secondary", size: "sm" })} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}>
          <MessageCircle className="size-4" aria-hidden /> Send on WhatsApp
        </a>
        <a
          className={buttonClass({ variant: "secondary", size: "sm" })}
          href={`mailto:?subject=${encodeURIComponent(`Connect Facebook for ${businessName}`)}&body=${encodeURIComponent(message)}`}
        >
          <Mail className="size-4" aria-hidden /> Email
        </a>
        <Button size="sm" variant="ghost" onClick={generate} disabled={pending}>
          New link
        </Button>
      </div>
      <p className="text-[13px] text-ink-muted">
        Valid for 7 days, works once. Creating a new link cancels the old one.
      </p>
    </div>
  );
}
