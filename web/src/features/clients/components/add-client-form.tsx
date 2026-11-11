"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { addClientAction, type AddClientState } from "../actions";

const initial: AddClientState = {};

export function AddClientForm() {
  const [state, action, pending] = useActionState(addClientAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && <Callout tone="error">{state.error}</Callout>}
      <Field id="businessName" label="Business name" error={state.fieldErrors?.businessName}>
        <Input
          id="businessName"
          name="businessName"
          placeholder="e.g. Bloom Café"
          required
          defaultValue={state.values?.businessName}
          aria-invalid={!!state.fieldErrors?.businessName}
          aria-describedby={state.fieldErrors?.businessName ? "businessName-error" : undefined}
        />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add client"}
      </Button>
    </form>
  );
}
