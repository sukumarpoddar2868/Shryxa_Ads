import "server-only";
import { db } from "@/lib/supabase/server";
import type { ClientRow } from "@/lib/supabase/types";

export type Client = ClientRow;

export const SERVICE_MODELS = {
  self_service: "Client runs it (self-service)",
  agency_managed: "We manage it (agency-managed)",
} as const;

export const BILLING_ARRANGEMENTS = {
  management_fee_only: "Management fee only — client pays Meta directly",
  management_plus_ad_budget: "Management fee + ad budget",
} as const;

export async function listClients(userId: number): Promise<Client[]> {
  const { data } = await db()
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .order("is_self", { ascending: false })
    .order("id", { ascending: true });
  return data ?? [];
}

export async function getClient(userId: number, clientId: number): Promise<Client | null> {
  if (!Number.isSafeInteger(clientId)) return null;
  const { data } = await db().from("clients").select("*").eq("id", clientId).eq("user_id", userId).maybeSingle();
  return data;
}

export async function countClients(userId: number): Promise<number> {
  const { count } = await db().from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}

export class ClientLimitError extends Error {}

export async function createClientRecord(
  user: { id: number; clientLimit: number },
  input: {
    businessName: string;
    serviceModel: keyof typeof SERVICE_MODELS;
    billingArrangement: keyof typeof BILLING_ARRANGEMENTS | null;
    isSelf?: boolean;
  },
): Promise<number> {
  if ((await countClients(user.id)) >= user.clientLimit) {
    throw new ClientLimitError(`Your plan allows ${user.clientLimit} client${user.clientLimit === 1 ? "" : "s"}.`);
  }
  const { data, error } = await db()
    .from("clients")
    .insert({
      user_id: user.id,
      business_name: input.businessName,
      service_model: input.serviceModel,
      billing_arrangement: input.serviceModel === "agency_managed" ? input.billingArrangement : null,
      client_status: "pending_access",
      is_self: input.isSelf ?? false,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create client: ${error?.message}`);
  return data.id;
}

/** Business-type accounts have exactly one client representing themselves. */
export async function ensureSelfClient(user: { id: number; clientLimit: number }): Promise<number> {
  const { data } = await db().from("clients").select("id").eq("user_id", user.id).eq("is_self", true).maybeSingle();
  if (data) return data.id;
  return createClientRecord(
    { id: user.id, clientLimit: Math.max(user.clientLimit, 1) },
    { businessName: "My business", serviceModel: "self_service", billingArrangement: null, isSelf: true },
  );
}

export async function deleteClientRecord(userId: number, clientId: number) {
  await db().from("clients").delete().eq("id", clientId).eq("user_id", userId).eq("is_self", false);
}

export async function renameClient(userId: number, clientId: number, businessName: string) {
  await db().from("clients").update({ business_name: businessName }).eq("id", clientId).eq("user_id", userId);
}

export type AssetSelection = {
  adAccountId: string | null;
  adAccountName: string | null;
  pageId: string | null;
  pageName: string | null;
  instagramId: string | null;
  instagramUsername: string | null;
  pixelId: string | null;
  pixelName: string | null;
};

export async function saveClientAssets(userId: number, clientId: number, a: AssetSelection) {
  const { error } = await db()
    .from("clients")
    .update({
      ad_account_id: a.adAccountId?.replace(/^act_/, "") ?? null,
      ad_account_name: a.adAccountName,
      page_id: a.pageId,
      page_name: a.pageName,
      instagram_actor_id: a.instagramId,
      instagram_username: a.instagramUsername,
      pixel_id: a.pixelId,
      pixel_name: a.pixelName,
      assets_updated_at: new Date().toISOString(),
      client_status: a.adAccountId && a.pageId ? "active" : "pending_access",
    })
    .eq("id", clientId)
    .eq("user_id", userId);
  if (error) {
    if (error.code === "23505") throw new Error("This ad account is already used by another of your clients.");
    throw new Error(`Could not save assets: ${error.message}`);
  }
}
