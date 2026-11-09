import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { metaEnv } from "@/lib/env";
import { db } from "@/lib/supabase/server";

/**
 * Meta's deauthorize + data-deletion callbacks send `signed_request`:
 * base64url(HMAC-SHA256(payload, app secret)) "." base64url(JSON payload).
 */
export function parseSignedRequest(signed: string): { user_id: string; issued_at?: number } | null {
  const [sig, payload] = signed.split(".", 2);
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", metaEnv().META_APP_SECRET).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { algorithm?: string; user_id?: string; issued_at?: number };
    if (data.algorithm?.toUpperCase() !== "HMAC-SHA256" || !data.user_id) return null;
    return { user_id: String(data.user_id), issued_at: data.issued_at };
  } catch {
    return null;
  }
}

/** Stateless confirmation code: verifiable later without storing anything. */
export function confirmationCode(metaUserId: string, at: number): string {
  const ts = at.toString(36);
  const mac = createHmac("sha256", metaEnv().META_APP_SECRET).update(`del:${metaUserId}:${ts}`).digest("hex").slice(0, 12);
  return `${ts}-${mac}`;
}

export function parseConfirmationCode(code: string): { at: Date } | null {
  const m = /^([0-9a-z]{6,10})-([0-9a-f]{12})$/.exec(code.trim());
  if (!m) return null;
  const at = Number.parseInt(m[1], 36);
  return Number.isFinite(at) ? { at: new Date(at) } : null;
}

/** Remove every stored token / identity for this Facebook user (all Shryxa accounts). */
export async function deleteMetaUserData(metaUserId: string): Promise<number> {
  const { data } = await db().from("meta_connections").delete().eq("meta_user_id", metaUserId).select("id");
  await db().from("meta_oauth_pending").delete().eq("meta_user_id", metaUserId);
  return data?.length ?? 0;
}
