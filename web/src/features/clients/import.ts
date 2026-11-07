import "server-only";
import { z } from "zod";
import { discoverAssets, missingScopes, permissionMessage, type Discovery } from "@/features/meta-connect/discovery";
import { getBusinessConnection, getConnectionToken, linkClientToBusiness, markConnection } from "@/features/meta-connect/store";
import { MetaApiError } from "@/lib/meta/graph";
import { ClientLimitError, countClients, createClientRecord, deleteClientRecord, listClients, saveClientAssets } from "./data";

export type ImportState = {
  error?: string;
  created?: { id: number; name: string }[];
  skipped?: { name: string; reason: string }[];
};

/** Live view of a Business Manager connection for the import screen. */
export async function loadBusinessImport(userId: number, connectionId: number) {
  const conn = await getBusinessConnection(userId, connectionId);
  if (!conn) return null;
  const token = conn.connection_status === "connected" ? await getConnectionToken(userId, connectionId) : null;
  const clients = await listClients(userId);
  const claimed = new Map(clients.filter((c) => c.ad_account_id).map((c) => [c.ad_account_id as string, { id: c.id, name: c.business_name ?? "" }]));

  if (!token) return { conn, discovery: null as Discovery | null, claimed, clientCount: clients.length, error: "This Business Manager connection has expired. Reconnect it." };
  const missing = missingScopes(conn.granted_scopes);
  if (missing.length) return { conn, discovery: null, claimed, clientCount: clients.length, error: permissionMessage(missing, "business") };
  try {
    return { conn, discovery: await discoverAssets(token), claimed, clientCount: clients.length, error: null as string | null };
  } catch (e) {
    if (e instanceof MetaApiError && e.isAuthError) {
      await markConnection(userId, connectionId, "expired");
      return { conn, discovery: null, claimed, clientCount: clients.length, error: "Facebook says this login expired or was revoked. Reconnect it." };
    }
    console.error("META_BUSINESS_DISCOVERY_FAILED", e instanceof MetaApiError ? { code: e.code, message: e.message } : e);
    if (e instanceof MetaApiError && e.isPermissionError) {
      return { conn, discovery: null, claimed, clientCount: clients.length, error: permissionMessage([], "business") };
    }
    return { conn, discovery: null, claimed, clientCount: clients.length, error: "We couldn't reach Meta just now. Refresh in a moment." };
  }
}

const name = z.string().trim().min(2).max(120);

/**
 * Creates one client per ticked ad account (form fields per account id:
 * `include:<id>`, `name:<id>`, `page:<id>`), validated against what the
 * Business Manager login can actually access, within the plan's limit.
 */
export async function importClients(user: { id: number; clientLimit: number }, connectionId: number, form: FormData): Promise<ImportState> {
  const conn = await getBusinessConnection(user.id, connectionId);
  if (!conn) return { error: "That Business Manager connection wasn't found." };
  const token = await getConnectionToken(user.id, connectionId);
  if (!token) return { error: "This Business Manager connection has expired. Reconnect it." };

  let found: Discovery;
  try {
    found = await discoverAssets(token);
  } catch {
    return { error: "We couldn't reach Meta just now. Please try again." };
  }

  const picked = found.adAccounts.filter((a) => form.get(`include:${a.accountId}`) === "on");
  if (picked.length === 0) return { error: "Tick at least one ad account to import." };

  let remaining = user.clientLimit - (await countClients(user.id));
  const created: NonNullable<ImportState["created"]> = [];
  const skipped: NonNullable<ImportState["skipped"]> = [];

  for (const acct of picked) {
    const parsedName = name.safeParse(form.get(`name:${acct.accountId}`));
    const clientName = parsedName.success ? parsedName.data : acct.name;
    if (remaining <= 0) {
      skipped.push({ name: clientName, reason: "Plan client limit reached" });
      continue;
    }
    const pageId = String(form.get(`page:${acct.accountId}`) ?? "");
    const page = pageId ? found.pages.find((p) => p.id === pageId) : undefined;
    if (pageId && !page) {
      skipped.push({ name: clientName, reason: "Page not available to this login" });
      continue;
    }

    let clientId: number | null = null;
    try {
      clientId = await createClientRecord(user, { businessName: clientName, serviceModel: "agency_managed", billingArrangement: "management_fee_only" });
      await linkClientToBusiness(user.id, clientId, connectionId);
      await saveClientAssets(user.id, clientId, {
        adAccountId: acct.accountId,
        adAccountName: acct.name,
        pageId: page?.id ?? null,
        pageName: page?.name ?? null,
        instagramId: page?.instagram?.id ?? null,
        instagramUsername: page?.instagram?.username ?? null,
        pixelId: null,
        pixelName: null,
      });
      created.push({ id: clientId, name: clientName });
      remaining--;
    } catch (e) {
      // Roll back a half-created client (e.g. ad account already used).
      if (clientId) await deleteClientRecord(user.id, clientId);
      skipped.push({
        name: clientName,
        reason: e instanceof ClientLimitError ? "Plan client limit reached" : e instanceof Error ? e.message : "Could not import",
      });
    }
  }
  return { created, skipped };
}
