"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { addClientAction, type AddClientState } from "../actions";

const initial: AddClientState = {};

export function AddClientForm({
  serviceModels,
  billingArrangements,
}: {
  serviceModels: Record<string, string>;
  billingArrangements: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(addClientAction, initial);
  const [model, setModel] = useState("self_service");

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
      <Field id="serviceModel" label="Who runs the ads?">
        <Select id="serviceModel" name="serviceModel" value={model} onChange={(e) => setModel(e.target.value)}>
          {Object.entries(serviceModels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {model === "agency_managed" && (
        <Field id="billingArrangement" label="Billing arrangement">
          <Select id="billingArrangement" name="billingArrangement" defaultValue="management_fee_only">
            {Object.entries(billingArrangements).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add client"}
      </Button>
    </form>
  );
}
