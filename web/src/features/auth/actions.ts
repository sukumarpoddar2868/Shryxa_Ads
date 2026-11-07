"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import { LoginSchema, SignupSchema, type AuthFormState } from "./schemas";
import { ensureSelfClient } from "@/features/clients/data";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: AuthFormState["fieldErrors"] = {};
  for (const i of issues) {
    const key = i.path[0] as keyof NonNullable<AuthFormState["fieldErrors"]>;
    out[key] ??= i.message;
  }
  return out;
}

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(form));
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };

  const { email, password } = parsed.data;
  const { data: user } = await db()
    .from("users")
    .select("id, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Incorrect email or password.", values };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function signupAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(form));
  const values = {
    email: String(form.get("email") ?? ""),
    currency: String(form.get("currency") ?? "INR"),
    accountType: String(form.get("accountType") ?? ""),
  };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };

  const { email, password, currency, accountType } = parsed.data;
  const now = new Date();
  const trialEnds = new Date(now.getTime() + env().TRIAL_DAYS * 86_400_000);

  const { data: user, error } = await db()
    .from("users")
    .insert({
      email,
      password_hash: await hashPassword(password),
      currency,
      account_type: accountType,
      created_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
    })
    .select("id")
    .single();

  if (error || !user) {
    if (error?.code === "23505") {
      return { fieldErrors: { email: "An account with this email already exists." }, values };
    }
    return { error: "Could not create your account. Please try again.", values };
  }

  // No multi-statement transactions in supabase-js: compensate on failure so a
  // user never exists without a subscription row (legacy invariant).
  const { error: subError } = await db()
    .from("subscriptions")
    .insert({ user_id: user.id, status: "trialing" });
  if (subError) {
    await db().from("users").delete().eq("id", user.id);
    return { error: "Could not create your account. Please try again.", values };
  }

  // Business owners get their single "My business" client up front.
  if (accountType === "business") {
    await ensureSelfClient({ id: user.id, clientLimit: 1 }).catch(() => undefined);
  }

  await createSession(user.id);
  redirect(accountType === "business" ? "/clients" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
