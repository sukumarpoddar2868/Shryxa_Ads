"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { loginAction, signupAction } from "../actions";
import type { AuthFormState } from "../schemas";

const initial: AuthFormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && <Callout tone="error">{state.error}</Callout>}
      <Field id="email" label="Email" error={fe.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? "email-error" : undefined}
        />
      </Field>
      <Field id="password" label="Password" error={fe.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!fe.password}
          aria-describedby={fe.password ? "password-error" : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-ink-muted">
        New here?{" "}
        <Link href="/signup" className="font-bold text-tomato-700 hover:underline">
          Start your free trial
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error && <Callout tone="error">{state.error}</Callout>}
      <fieldset aria-describedby={fe.accountType ? "accountType-error" : undefined}>
        <legend className="mb-2 text-[13px] font-bold">How will you use Shryxa Ads?</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "business", title: "My own business", body: "Run ads for one business" },
            { value: "agency", title: "I manage clients", body: "Agency or freelancer" },
          ].map((o) => (
            <label
              key={o.value}
              className="cursor-pointer rounded-[10px] bg-lavender-soft p-4 ring-2 ring-transparent transition-colors hover:ring-line has-[:checked]:bg-chartreuse has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lavender-deep"
            >
              <input
                type="radio"
                name="accountType"
                value={o.value}
                defaultChecked={state.values?.accountType === o.value}
                required
                className="sr-only"
              />
              <span className="block text-[15px] font-extrabold leading-tight">{o.title}</span>
              <span className="mt-1 block text-[13px] text-ink-muted">{o.body}</span>
            </label>
          ))}
        </div>
        {fe.accountType && (
          <p id="accountType-error" className="mt-1.5 text-[13px] text-tomato-700">
            {fe.accountType}
          </p>
        )}
      </fieldset>
      <Field id="email" label="Work email" error={fe.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? "email-error" : undefined}
        />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters." error={fe.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={!!fe.password}
          aria-describedby={fe.password ? "password-error" : undefined}
        />
      </Field>
      <Field id="currency" label="Billing currency" error={fe.currency}>
        <Select id="currency" name="currency" defaultValue={state.values?.currency ?? "INR"}>
          <option value="INR">INR — Indian Rupee</option>
          <option value="USD">USD — US Dollar</option>
        </Select>
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="font-bold text-ink hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-bold text-ink hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-tomato-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
