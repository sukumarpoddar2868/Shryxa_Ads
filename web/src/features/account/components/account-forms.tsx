"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { changePasswordAction, deleteAccountAction, type FormState } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="grid gap-4 sm:max-w-md">
      <Field id="pw-current" label="Current password">
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field id="pw-next" label="New password" hint="At least 8 characters.">
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field id="pw-confirm" label="Repeat new password">
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      {state.error && <Callout tone="error">{state.error}</Callout>}
      {state.ok && <Callout tone="success">{state.message}</Callout>}
      <Button type="submit" variant="secondary" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)} className="self-start">
        Delete account…
      </Button>
    );
  }
  return (
    <form action={action} className="grid gap-4 sm:max-w-md">
      <Callout tone="error">
        This deletes your Shryxa account, clients, Facebook connections, drafts and uploaded media, and cancels any plan. It can&apos;t be undone. Campaigns already on Meta stay in your ad account.
      </Callout>
      <Field id="del-email" label={`Type ${email} to confirm`}>
        <Input id="del-email" name="confirm" autoComplete="off" required />
      </Field>
      <Field id="del-pw" label="Password">
        <Input id="del-pw" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && <Callout tone="error">{state.error}</Callout>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete everything"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
