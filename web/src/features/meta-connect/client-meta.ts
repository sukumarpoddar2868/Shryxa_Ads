import "server-only";
import { db } from "@/lib/supabase/server";
import type { Client } from "@/features/clients/data";
import { MetaApiError } from "@/lib/meta/graph";
import {
  adAccountHealth,
  buildReadiness,
  discoverAssets,
  listPixels,
  missingScopes,
  permissionMessage,
  type AccountHealth,
  type Discovery,
  type PixelOption,
  type ReadinessItem,
} from "./discovery";
import { getConnectionInfo, getConnectionToken, markConnection, type ConnectionInfo } from "./store";

export type ClientMeta = {
  connection: ConnectionInfo | null;
  discovery: Discovery | null;
  pixels: PixelOption[];
  health: AccountHealth | null;
  readiness: ReadinessItem[];
  error: string | null;
};

/** Everything a client page needs from Meta, fetched live in parallel. */
export async function loadClientMeta(userId: number, client: Client): Promise<ClientMeta> {
  const connection = await getConnectionInfo(userId, client.meta_connection_id);
  const empty = (error: string | null, conn = connection): ClientMeta => ({
    connection: conn,
    discovery: null,
    pixels: [],
    health: null,
    error,
    readiness: buildReadiness({
      connected: false,
      adAccountId: null,
      pageId: client.page_id,
      pageName: client.page_name,
      instagramUsername: client.instagram_username,
      pixelName: client.pixel_name,
      health: null,
      healthError: null,
    }),
  });

  if (!connection || connection.connection_status !== "connected") {
    return empty(
      !connection
        ? null
        : connection.connection_status === "error"
          ? "We couldn't read the saved Facebook login. Please reconnect."
          : "This Facebook connection has expired. Reconnect to continue.",
    );
  }

  const missing = missingScopes(connection.granted_scopes);
  if (missing.length) return empty(permissionMessage(missing, connection.source === "business" ? "business" : "client"));

  const token = await getConnectionToken(userId, connection.id);
  if (!token) return empty("We couldn't read the saved Facebook login. Please reconnect.", { ...connection, connection_status: "error" });

  try {
    const [discovery, pixels, healthResult, policyAccepted] = await Promise.all([
      discoverAssets(token),
      client.ad_account_id ? listPixels(token, client.ad_account_id) : Promise.resolve([]),
      client.ad_account_id
        ? adAccountHealth(token, client.ad_account_id).then(
            (h) => ({ h, err: null as string | null }),
            (e: unknown) => ({ h: null, err: e instanceof MetaApiError ? `Meta: ${e.message}` : "Could not read the ad account." }),
          )
        : Promise.resolve({ h: null, err: null }),
      shryxaAdCreated(userId, client.id),
    ]);
    return {
      connection,
      discovery,
      pixels,
      health: healthResult.h,
      error: null,
      readiness: buildReadiness({
        connected: true,
        adAccountId: client.ad_account_id,
        pageId: client.page_id,
        pageName: client.page_name,
        instagramUsername: client.instagram_username,
        pixelName: client.pixel_name,
        health: healthResult.h,
        healthError: healthResult.err,
        policyAccepted,
      }),
    };
  } catch (e) {
    if (e instanceof MetaApiError && e.isAuthError) {
      await markConnection(userId, connection.id, "expired");
      return empty("Facebook says this login has expired or was revoked. Reconnect to continue.", {
        ...connection,
        connection_status: "expired",
      });
    }
    console.error("META_DISCOVERY_FAILED", e instanceof MetaApiError ? { code: e.code, message: e.message } : e);
    if (e instanceof MetaApiError && e.isPermissionError) {
      return empty(permissionMessage([], connection.source === "business" ? "business" : "client"));
    }
    return empty("We couldn't reach Meta just now. Refresh in a moment.");
  }
}

export const META_ERRORS: Record<string, string> = {
  denied: "Facebook login was cancelled. You can try again any time.",
  expired_state: "That login took too long or was already used. Please try again.",
  no_code: "Facebook didn't complete the login. Please try again.",
  exchange_failed: "We couldn't finish connecting to Facebook. Please try again.",
  not_configured: "Meta isn't configured on this server yet (missing app settings).",
  invite_expired: "This invite link has expired. Ask for a new one.",
  invite_used: "This invite was already completed.",
  unknown_client: "That client wasn't found.",
  agency_only: "Business Manager connect is for agency accounts.",
};

/** Has Shryxa created an ad for this client? (Meta only allows that after the Non-discrimination Policy.) */
async function shryxaAdCreated(userId: number, clientId: number): Promise<boolean> {
  const { count } = await db()
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("state", "launched")
    .not("meta_ad_id", "is", null);
  return (count ?? 0) > 0;
}
