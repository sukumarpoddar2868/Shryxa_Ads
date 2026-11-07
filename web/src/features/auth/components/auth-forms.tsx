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
