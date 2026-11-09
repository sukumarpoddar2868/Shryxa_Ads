"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { metaEnv } from "@/lib/env";
import { MetaApiError, graphGet, grantedScopes } from "@/lib/meta/graph";
import { saveClientConnection } from "./store";

export type TestTokenState = { error?: string; ok?: boolean };

/**
 * Admin-only testing aid: connect a client with a token from Graph API
 * Explorer / Marketing API sandbox tools (e.g. a Meta test user, or the
 * developer account that owns a sandbox ad account). Same storage and
 * encryption as a normal Facebook login.
 */
export async function connectWithTestTokenAction(clientId: number, _prev: TestTokenState, form: FormData): Promise<TestTokenState> {
  const user = await requireAdmin();
  const token = z.string().trim().min(40).max(1000).regex(/^[A-Za-z0-9|_\-.]+$/).safeParse(form.get("token"));
  if (!token.success) return { error: "Paste a valid access token." };
  const client = await getClient(user.id, clientId);
  if (!client) return { error: "Client not found." };
  try {
    const { META_APP_ID, META_APP_SECRET } = metaEnv();
    const [me, scopes, debug] = await Promise.all([
      graphGet<{ id: string; name: string }>("me", token.data, { fields: "id,name" }),
      grantedScopes(token.data).catch(() => [] as string[]),
      graphGet<{ data?: { app_id?: string; expires_at?: number } }>("debug_token", `${META_APP_ID}|${META_APP_SECRET}`, { input_token: token.data }).catch(() => ({ data: undefined })),
    ]);
    if (debug.data?.app_id && debug.data.app_id !== META_APP_ID) return { error: "That token belongs to a different Meta app. Generate it for this app." };
    const exp = debug.data?.expires_at ? new Date(debug.data.expires_at * 1000) : null;
    await saveClientConnection({ userId: user.id, clientId, source: "owner", metaUserId: me.id, metaUserName: `${me.name} (test token)`, token: token.data, expiresAt: exp, scopes });
  } catch (e) {
    return { error: e instanceof MetaApiError ? e.userMessage || e.message : "Couldn't use that token." };
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
