import "server-only";
import { db } from "@/lib/supabase/server";
import type { MetaConnectionRow } from "@/lib/supabase/types";
import { decryptToken, encryptToken, newSecret, sha256 } from "./secrets";

/* ------------------------------------------------------- OAuth state */

const STATE_TTL_MIN = 15;

export type OAuthFlow = { flow: "owner" | "invite"; userId: number; clientId: number; inviteId?: number };

export async function createOAuthState(f: OAuthFlow): Promise<string> {
  const state = newSecret();
  const { error } = await db()
    .from("meta_oauth_states")
    .insert({
      state_hash: sha256(state),
      user_id: f.userId,
      client_id: f.clientId,
      flow: f.flow,
      invite_id: f.inviteId ?? null,
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
  if (!data || data.flow === "business") return null;
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
  return decryptToken(data.access_token_encrypted);
}

export async function markConnection(userId: number, connectionId: number, status: MetaConnectionRow["connection_status"]) {
  await db()
    .from("meta_connections")
    .update({ connection_status: status, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/** Disconnect = delete the stored token and clear the client's chosen assets. */
export async function disconnectClient(userId: number, clientId: number, connectionId: number | null) {
  if (connectionId) await db().from("meta_connections").delete().eq("id", connectionId).eq("user_id", userId);
  await db()
    .from("clients")
    .update({
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
      client_status: "pending_access",
    })
    .eq("id", clientId)
    .eq("user_id", userId);
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
