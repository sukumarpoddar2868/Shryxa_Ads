import "server-only";
import type { Client } from "@/features/clients/data";
import { MetaApiError } from "@/lib/meta/graph";
import {
  adAccountHealth,
  buildReadiness,
  discoverAssets,
  listPixels,
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
    return empty(connection ? "This Facebook connection has expired. Reconnect to continue." : null);
  }

  const token = await getConnectionToken(userId, connection.id);
  if (!token) return empty("This Facebook connection has expired. Reconnect to continue.");

  try {
    const [discovery, pixels, healthResult] = await Promise.all([
      discoverAssets(token),
      client.ad_account_id ? listPixels(token, client.ad_account_id) : Promise.resolve([]),
      client.ad_account_id
        ? adAccountHealth(token, client.ad_account_id).then(
            (h) => ({ h, err: null as string | null }),
            (e: unknown) => ({ h: null, err: e instanceof MetaApiError ? `Meta: ${e.message}` : "Could not read the ad account." }),
          )
        : Promise.resolve({ h: null, err: null }),
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
};
