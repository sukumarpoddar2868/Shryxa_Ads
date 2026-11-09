"use server";

import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { getConnectionToken } from "@/features/meta-connect/store";
import { graphGet } from "@/lib/meta/graph";

export type WhatsAppLinkStatus =
  | { state: "linked" }
  | { state: "not_linked" }
  | { state: "other"; linked: string }
  | { state: "unknown" };

const digits = (s: string) => s.replace(/\D/g, "");
/** Same number if the last 10 digits match (handles +91 / 0 prefixes). */
const sameNumber = (a: string, b: string) => {
  const x = digits(a);
  const y = digits(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-10) === y.slice(-10);
};

/** Is this number the WhatsApp number linked to the client's Facebook Page? */
export async function whatsappLinkStatusAction(clientId: number, number: string): Promise<WhatsAppLinkStatus> {
  const user = await requireUser();
  if (!Number.isSafeInteger(clientId) || typeof number !== "string" || digits(number).length < 8) return { state: "unknown" };
  const client = await getClient(user.id, clientId);
  if (!client?.page_id || !client.meta_connection_id) return { state: "unknown" };
  const token = await getConnectionToken(user.id, client.meta_connection_id);
  if (!token) return { state: "unknown" };
  try {
    // Meta omits these fields both when nothing is linked AND when it won't
    // share them with this app (seen in Development mode) — so only an
    // explicit false counts as "not linked"; a missing value is "unknown".
    const page = await graphGet<{ whatsapp_number?: string; has_whatsapp_number?: boolean }>(client.page_id, token, { fields: "whatsapp_number,has_whatsapp_number" });
    const linked = page.whatsapp_number?.trim();
    if (!linked) return page.has_whatsapp_number === false ? { state: "not_linked" } : { state: "unknown" };
    return sameNumber(linked, number) ? { state: "linked" } : { state: "other", linked };
  } catch {
    return { state: "unknown" };
  }
}
