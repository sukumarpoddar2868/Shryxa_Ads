import "server-only";
import { graphGet } from "@/lib/meta/graph";

/** Page-scoped calls (lead forms, leads) need a Page access token, derived from the user token. */
export async function pageAccessToken(pageId: string, userToken: string): Promise<string> {
  const res = await graphGet<{ access_token?: string }>(pageId, userToken, { fields: "access_token" });
  if (!res.access_token) {
    throw new Error("Couldn't get a Page token. Reconnect Facebook and allow access to this Page (pages_manage_ads, leads_retrieval).");
  }
  return res.access_token;
}
