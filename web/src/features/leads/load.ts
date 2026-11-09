import "server-only";
import { getClient, listClients } from "@/features/clients/data";
import { pageAccessToken } from "@/features/meta-connect/page-token";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphList } from "@/lib/meta/graph";
import type { Lead } from "./csv.ts";

export { fieldLabel, leadColumns, leadsCsv, type Lead } from "./csv.ts";

/**
 * Lead inbox: instant-form leads read live from Meta (leads_retrieval).
 * Nothing is stored in Shryxa — Meta keeps leads for 90 days.
 */

/** `labels`: question key → the question text shown on the form ("q1" → "Date of your visit"). */
export type LeadForm = { id: string; name: string; status: string; leadsCount: number | null; created: string | null; labels: Record<string, string> };


type RawLead = {
  id: string;
  created_time: string;
  field_data?: { name: string; values?: string[] }[];
  ad_name?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
};

export const leadError = (e: unknown) =>
  e instanceof MetaApiError
    ? e.isPermissionError
      ? "Meta didn't allow reading leads. Reconnect Facebook and allow leads access (leads_retrieval) for this Page."
      : e.userMessage || e.message
    : e instanceof Error
      ? e.message
      : "Couldn't load leads.";

export async function clientsWithPages(userId: number) {
  return (await listClients(userId))
    .filter((c) => c.meta_connection_id && c.page_id)
    .map((c) => ({ id: c.id, name: c.business_name ?? "Untitled client", pageName: c.page_name }));
}

async function pageToken(userId: number, clientId: number) {
  const client = await getClient(userId, clientId);
  if (!client?.page_id || !client.meta_connection_id) throw new Error("Pick this client's Facebook Page first.");
  const userToken = await getConnectionToken(userId, client.meta_connection_id);
  if (!userToken) throw new Error("Facebook connection expired — reconnect on the client page.");
  return { pageId: client.page_id, token: await pageAccessToken(client.page_id, userToken) };
}

export async function listLeadForms(userId: number, clientId: number): Promise<LeadForm[]> {
  const { pageId, token } = await pageToken(userId, clientId);
  const forms = await graphList<{ id: string; name?: string; status?: string; leads_count?: number; created_time?: string; questions?: { key?: string; label?: string }[] }>(
    `${pageId}/leadgen_forms`,
    token,
    { fields: "id,name,status,leads_count,created_time,questions{key,label}" },
    5,
  );
  return forms
    .map((f) => ({
      id: f.id,
      name: f.name ?? `Form ${f.id}`,
      status: f.status ?? "",
      leadsCount: f.leads_count ?? null,
      created: f.created_time ?? null,
      labels: Object.fromEntries((f.questions ?? []).filter((q) => q.key && q.label).map((q) => [q.key!, q.label!])),
    }))
    // Forms with leads first, then newest.
    .sort((a, b) => Number((b.leadsCount ?? 0) > 0) - Number((a.leadsCount ?? 0) > 0) || (b.created ?? "").localeCompare(a.created ?? ""));
}

/** Leads for one form, newest first. The form must belong to the client's Page. */
export async function listLeads(userId: number, clientId: number, formId: string, maxPages = 20): Promise<{ form: LeadForm; leads: Lead[] }> {
  if (!/^\d{5,25}$/.test(formId)) throw new Error("Unknown form.");
  const forms = await listLeadForms(userId, clientId);
  const form = forms.find((f) => f.id === formId);
  if (!form) throw new Error("That form isn't on this client's Page.");
  const { token } = await pageToken(userId, clientId);
  const raw = await graphList<RawLead>(`${formId}/leads`, token, { fields: "id,created_time,field_data,ad_name,campaign_name,platform,is_organic" }, maxPages);
  const leads = raw.map((l) => ({
    id: l.id,
    created: l.created_time,
    fields: Object.fromEntries((l.field_data ?? []).map((f) => [f.name, (f.values ?? []).join(", ")])),
    adName: l.ad_name ?? null,
    campaignName: l.campaign_name ?? null,
    platform: l.platform ?? null,
    isOrganic: Boolean(l.is_organic),
  }));
  leads.sort((a, b) => b.created.localeCompare(a.created));
  return { form, leads };
}

