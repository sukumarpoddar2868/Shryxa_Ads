import "server-only";
import { db } from "@/lib/supabase/server";
import type { MetaConnectionRow } from "@/lib/supabase/types";
import { decryptToken, encryptToken, newSecret, sha256 } from "./secrets";

/* ------------------------------------------------------- OAuth state */

const STATE_TTL_MIN = 15;

export type OAuthFlow =
  | { flow: "owner" | "invite"; userId: number; clientId: number; inviteId?: number }
  | { flow: "business"; userId: number };

export async function createOAuthState(f: OAuthFlow): Promise<string> {
  const state = newSecret();
  const { error } = await db()
    .from("meta_oauth_states")
    .insert({
      state_hash: sha256(state),
      user_id: f.userId,
      client_id: f.flow === "business" ? null : f.clientId,
      flow: f.flow,
      invite_id: f.flow === "invite" ? (f.inviteId ?? null) : null,
      expires_at: new Date(Date.now() + STATE_TTL_MIN * 60_000).toISOString(),
    });
  if (error) throw new Error(`Could not start Meta login: ${error.message}`);
  return state;
}

/** One-time: DELETE … RETURNING, so a state can never be replayed. */
export async function consumeOAuthState(state: string): Promise<OAuthFlow | null> {
  const { data } = await db()
    .from("meta_oauth_states")
    .delete()
    .eq("state_hash", sha256(state))
    .gt("expires_at", new Date().toISOString())
    .select("user_id, client_id, flow, invite_id")
    .maybeSingle();
  if (!data) return null;
  if (data.flow === "business") return { flow: "business", userId: data.user_id };
  if (data.client_id === null) return null;
  return { flow: data.flow, userId: data.user_id, clientId: data.client_id, inviteId: data.invite_id ?? undefined };
}

/* ------------------------------------------------------- Connections */

export async function saveClientConnection(input: {
  userId: number;
  clientId: number;
  source: "owner" | "invite";
  metaUserId: string;
  metaUserName: string;
  token: string;
  expiresAt: Date | null;
  scopes: string[];
}): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("meta_connections")
    .upsert(
      {
        user_id: input.userId,
        client_id: input.clientId,
        source: input.source,
        token_type: "user",
        meta_user_id: input.metaUserId,
        meta_user_name: input.metaUserName,
        access_token_encrypted: encryptToken(input.token),
        token_expires_at: input.expiresAt?.toISOString() ?? null,
        granted_scopes: input.scopes,
        connection_status: "connected",
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "client_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not save Meta connection: ${error?.message}`);

  await db().from("clients").update({ meta_connection_id: data.id }).eq("id", input.clientId).eq("user_id", input.userId);
  return data.id;
}

export type ConnectionInfo = Pick<
  MetaConnectionRow,
  "id" | "meta_user_name" | "connected_at" | "token_expires_at" | "connection_status" | "source" | "granted_scopes"
>;

export async function getConnectionInfo(userId: number, connectionId: number | null): Promise<ConnectionInfo | null> {
  if (!connectionId) return null;
  const { data } = await db()
    .from("meta_connections")
    .select("id, meta_user_name, connected_at, token_expires_at, connection_status, source, granted_scopes")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** Decrypted token for server-side Meta calls. Never send this to the browser. */
export async function getConnectionToken(userId: number, connectionId: number): Promise<string | null> {
  const { data } = await db()
    .from("meta_connections")
    .select("access_token_encrypted, connection_status")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.connection_status !== "connected") return null;
  try {
    return decryptToken(data.access_token_encrypted);
  } catch {
    // Corrupt token or a changed META_TOKEN_ENCRYPTION_KEY: never crash the
    // page — flag the connection so the UI asks for a reconnect.
    console.error("META_TOKEN_DECRYPT_FAILED", { connectionId });
    await markConnection(userId, connectionId, "error");
    return null;
  }
}

export async function markConnection(userId: number, connectionId: number, status: MetaConnectionRow["connection_status"]) {
  await db()
    .from("meta_connections")
    .update({ connection_status: status, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

const CLEARED_ASSETS = {
  meta_connection_id: null,
  ad_account_id: null,
  ad_account_name: null,
  page_id: null,
  page_name: null,
  instagram_actor_id: null,
  instagram_username: null,
  pixel_id: null,
  pixel_name: null,
  assets_updated_at: null,
  client_status: "pending_access" as const,
};

/**
 * Disconnect a client. Its own login (owner/invite) is deleted; a shared
 * Business Manager connection is only unlinked — other clients keep using it.
 */
export async function disconnectClient(userId: number, clientId: number, connectionId: number | null) {
  if (connectionId) {
    await db().from("meta_connections").delete().eq("id", connectionId).eq("user_id", userId).eq("client_id", clientId);
  }
  await db().from("clients").update(CLEARED_ASSETS).eq("id", clientId).eq("user_id", userId);
}

/* ------------------------------------------- Business Manager (path B) */

export async function saveBusinessConnection(input: {
  userId: number;
  metaUserId: string;
  metaUserName: string;
  token: string;
  expiresAt: Date | null;
  scopes: string[];
  tokenType: "user" | "system_user";
  businessId: string | null;
}): Promise<number> {
  const now = new Date().toISOString();
  const row = {
    user_id: input.userId,
    client_id: null,
    source: "business" as const,
    token_type: input.tokenType,
    meta_user_id: input.metaUserId,
    meta_user_name: input.metaUserName,
    meta_business_id: input.businessId,
    access_token_encrypted: encryptToken(input.token),
    token_expires_at: input.expiresAt?.toISOString() ?? null,
    granted_scopes: input.scopes,
    connection_status: "connected" as const,
    updated_at: now,
  };
  // Reconnecting the same Business Manager refreshes the existing row.
  const { data: existing } = await db()
    .from("meta_connections")
    .select("id")
    .eq("user_id", input.userId)
    .eq("source", "business")
    .eq("meta_user_id", input.metaUserId)
    .maybeSingle();
  if (existing) {
    const { error } = await db().from("meta_connections").update(row).eq("id", existing.id);
    if (error) throw new Error(`Could not save Business Manager connection: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await db()
    .from("meta_connections")
    .insert({ ...row, connected_at: now })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not save Business Manager connection: ${error?.message}`);
  return data.id;
}

export type BusinessConnection = Pick<
  MetaConnectionRow,
  "id" | "meta_user_name" | "meta_business_id" | "connected_at" | "token_expires_at" | "token_type" | "connection_status"
> & { clientCount: number };

export async function listBusinessConnections(userId: number): Promise<BusinessConnection[]> {
  const [{ data: conns }, { data: clients }] = await Promise.all([
    db()
      .from("meta_connections")
      .select("id, meta_user_name, meta_business_id, connected_at, token_expires_at, token_type, connection_status")
      .eq("user_id", userId)
      .eq("source", "business")
      .order("id"),
    db().from("clients").select("meta_connection_id").eq("user_id", userId).not("meta_connection_id", "is", null),
  ]);
  return (conns ?? []).map((c) => ({
    ...c,
    clientCount: (clients ?? []).filter((x) => x.meta_connection_id === c.id).length,
  }));
}

export async function getBusinessConnection(userId: number, connectionId: number) {
  if (!Number.isSafeInteger(connectionId)) return null;
  const { data } = await db()
    .from("meta_connections")
    .select("id, meta_user_name, meta_business_id, connection_status, token_type, token_expires_at, granted_scopes")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("source", "business")
    .maybeSingle();
  return data;
}

/** Point a client at a Business Manager connection (assets are picked after). */
export async function linkClientToBusiness(userId: number, clientId: number, connectionId: number): Promise<boolean> {
  const conn = await getBusinessConnection(userId, connectionId);
  if (!conn) return false;
  await db()
    .from("clients")
    .update({ ...CLEARED_ASSETS, meta_connection_id: connectionId })
    .eq("id", clientId)
    .eq("user_id", userId);
  return true;
}

/** Remove a Business Manager connection and unlink every client using it. */
export async function removeBusinessConnection(userId: number, connectionId: number) {
  await db().from("clients").update(CLEARED_ASSETS).eq("user_id", userId).eq("meta_connection_id", connectionId);
  await db().from("meta_connections").delete().eq("id", connectionId).eq("user_id", userId).eq("source", "business");
}

/* ---------------------------------------------------------- Invites */

const INVITE_TTL_DAYS = 7;

export async function createInvite(userId: number, clientId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = newSecret(24);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  // Only one live invite per client: older links stop working.
  await db().from("client_invites").delete().eq("client_id", clientId).eq("user_id", userId).is("used_at", null);
  const { error } = await db()
    .from("client_invites")
    .insert({ token_hash: sha256(token), user_id: userId, client_id: clientId, expires_at: expiresAt.toISOString() });
  if (error) throw new Error(`Could not create invite: ${error.message}`);
  return { token, expiresAt };
}

export type ResolvedInvite = {
  inviteId: number;
  userId: number;
  clientId: number;
  businessName: string;
  agencyEmail: string;
  usedAt: string | null;
  connectionId: number | null;
};

/** Looks up an invite by its raw token. Returns null if unknown or expired. */
export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  if (!token || token.length > 128) return null;
  const { data: inv } = await db()
    .from("client_invites")
    .select("id, user_id, client_id, used_at, expires_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!inv || new Date(inv.expires_at).getTime() < Date.now()) return null;

  const [{ data: client }, { data: owner }] = await Promise.all([
    db().from("clients").select("business_name, meta_connection_id").eq("id", inv.client_id).maybeSingle(),
    db().from("users").select("email").eq("id", inv.user_id).maybeSingle(),
  ]);
  if (!client || !owner) return null;

  return {
    inviteId: inv.id,
    userId: inv.user_id,
    clientId: inv.client_id,
    businessName: client.business_name ?? "your business",
    agencyEmail: owner.email,
    usedAt: inv.used_at,
    connectionId: client.meta_connection_id,
  };
}

export async function markInviteUsed(inviteId: number) {
  await db().from("client_invites").update({ used_at: new Date().toISOString() }).eq("id", inviteId);
}
