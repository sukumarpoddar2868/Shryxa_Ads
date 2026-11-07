import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Sessions reuse the legacy `public.sessions` table (token, user_id,
 * created_at, expires_at), so the Python and Next.js apps can run side by side.
 */
export const SESSION_COOKIE = "shryxa_session";

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

export async function createSession(userId: number): Promise<void> {
  const token = randomUUID().replaceAll("-", "");
  const expires = daysFromNow(env().SESSION_DAYS);

  const { error } = await db().from("sessions").insert({
    token,
    user_id: userId,
    created_at: new Date().toISOString(),
    expires_at: expires.toISOString(),
  });
  if (error) throw new Error(`Could not create session: ${error.message}`);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** Returns the user id for the current cookie, or null if missing/expired. */
export async function readSessionUserId(): Promise<number | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await db()
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await db().from("sessions").delete().eq("token", token);
    return null;
  }
  return Number(data.user_id);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().from("sessions").delete().eq("token", token);
  jar.delete(SESSION_COOKIE);
}
