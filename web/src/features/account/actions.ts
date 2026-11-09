"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { hashPassword, verifyPassword } from "@/features/auth/password";
import { destroySession, endOtherSessions } from "@/features/auth/session";
import { db } from "@/lib/supabase/server";
import { deleteAccountData } from "./delete";

export type FormState = { ok?: boolean; message?: string; error?: string };

const PasswordForm = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(8, "Use at least 8 characters.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The new passwords don't match.", path: ["confirm"] });

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = PasswordForm.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { data } = await db().from("users").select("password_hash").eq("id", user.id).single();
  if (!data || !(await verifyPassword(p.data.current, data.password_hash))) return { error: "Your current password is wrong." };
  await db().from("users").update({ password_hash: await hashPassword(p.data.next) }).eq("id", user.id);
  await endOtherSessions(user.id);
  return { ok: true, message: "Password changed. Other devices were signed out." };
}

export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.isAdmin) return { error: "Admin accounts can't be deleted here." };
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== user.email.toLowerCase()) {
    return { error: "Type your email exactly to confirm." };
  }
  const { data } = await db().from("users").select("password_hash").eq("id", user.id).single();
  if (!data || !(await verifyPassword(String(form.get("password") ?? ""), data.password_hash))) return { error: "Password is wrong." };
  try {
    await deleteAccountData(user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't delete the account." };
  }
  await destroySession();
  redirect("/?deleted=1");
}
