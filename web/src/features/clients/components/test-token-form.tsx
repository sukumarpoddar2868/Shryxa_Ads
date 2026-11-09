"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { connectWithTestTokenAction, type TestTokenState } from "@/features/meta-connect/test-token-actions";
import { cn } from "@/lib/cn";

export function TestTokenForm({ clientId }: { clientId: number }) {
  const [state, action, pending] = useActionState<TestTokenState, FormData>(connectWithTestTokenAction.bind(null, clientId), {});
  return (
    <details className="rounded-[10px] bg-lavender-soft p-5">
      <summary className="cursor-pointer text-[15px] font-bold">Admin · connect with a test token</summary>
      <form action={action} className="mt-4 grid gap-3">
        <p className="text-[14px] text-ink-muted">
          For Meta test users and sandbox ad accounts. Generate a user token in Graph API Explorer for this app with ads_management, ads_read, business_management, pages_show_list,
          pages_read_engagement, pages_manage_ads, leads_retrieval — then paste it here.
        </p>
        <Field id={`tt-${clientId}`} label="Access token">
          <textarea id={`tt-${clientId}`} name="token" rows={3} required className={cn(inputClass, "h-auto py-3 font-mono text-[12px]")} autoComplete="off" spellCheck={false} />
        </Field>
        {state.error && <Callout tone="error">{state.error}</Callout>}
        {state.ok && <Callout tone="success">Connected. Pick the ad account and Page below.</Callout>}
        <Button type="submit" variant="secondary" size="sm" disabled={pending} className="justify-self-start">
          {pending ? "Checking…" : "Use this token"}
        </Button>
      </form>
    </details>
  );
}
