import "server-only";
import { listClients } from "@/features/clients/data";
import { actId } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphGet, graphList } from "@/lib/meta/graph";
import type { CampaignRow } from "@/lib/supabase/types";
import { listCampaignRows } from "./store";

/**
 * Campaigns tab data: live campaigns from Meta for every connected client
 * (status, budget, 7-day spend/results), merged with Shryxa's own rows
 * (tag + destination) and drafts. Nothing about performance is stored.
 */

export type ListStatus = "active" | "paused" | "review" | "off" | "issue";

export type CampaignListItem = {
  key: string;
  clientId: number;
  clientName: string;
  metaId: string;
  name: string;
  objective: string | null;
  destination: string | null;
  status: ListStatus;
  statusLabel: string;
  currency: string;
  budget: { amount: number; type: "daily" | "lifetime" } | null; // major units
  /** Lifetime spend cap (major units), null = none. */
  spendCap: number | null;
  /** Raw Meta status the user set (ACTIVE / PAUSED / ARCHIVED). */
  configuredStatus: string | null;
  spend: number; // last 7 days, major units
  results: number | null;
  resultLabel: string | null;
  costPerResult: number | null;
  created: string | null;
  fromShryxa: boolean;
  adsManagerUrl: string;
};

export type DraftListItem = { id: number; clientId: number; clientName: string; name: string; objective: string | null; destination: string | null; updatedAt: string; headline: string };

export type CampaignList = {
  campaigns: CampaignListItem[];
  drafts: DraftListItem[];
  errors: { clientName: string; message: string }[];
  clients: { id: number; name: string }[];
};

type MetaAction = { action_type: string; value: string };
type MetaCampaign = {
  id: string;
  name?: string;
  objective?: string;
  effective_status?: string;
  status?: string;
  spend_cap?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time?: string;
  adsets?: { data?: { daily_budget?: string; lifetime_budget?: string }[] };
  insights?: { data?: Insight[] };
};

const STATUS: Record<string, [ListStatus, string]> = {
  ACTIVE: ["active", "Active"],
  PAUSED: ["paused", "Paused"],
  CAMPAIGN_PAUSED: ["paused", "Paused"],
  ADSET_PAUSED: ["paused", "Paused"],
  IN_PROCESS: ["review", "Processing"],
  PENDING_REVIEW: ["review", "In review"],
  PREAPPROVED: ["review", "In review"],
  WITH_ISSUES: ["issue", "Has issues"],
  DISAPPROVED: ["issue", "Rejected"],
  PENDING_BILLING_INFO: ["issue", "Needs payment"],
  ARCHIVED: ["off", "Archived"],
  DELETED: ["off", "Deleted"],
};

/** Which action counts as a "result" per objective (first match wins). */
const RESULT_ACTIONS: Record<string, [string, string[]]> = {
  OUTCOME_LEADS: ["Leads", ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d"]],
  OUTCOME_ENGAGEMENT: ["Chats", ["onsite_conversion.messaging_conversation_started_7d", "post_engagement"]],
  OUTCOME_SALES: ["Purchases", ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]],
};

type Insight = { spend?: string; reach?: string; inline_link_clicks?: string; actions?: MetaAction[] };

function results(objective: string | undefined, ins: Insight | undefined): { value: number | null; label: string | null } {
  if (!ins) return { value: null, label: null };
  if (objective === "OUTCOME_TRAFFIC") return { value: Number(ins.inline_link_clicks ?? 0), label: "Link clicks" };
  if (objective === "OUTCOME_AWARENESS") return { value: Number(ins.reach ?? 0), label: "Reach" };
  const rule = RESULT_ACTIONS[objective ?? ""];
  if (!rule) return { value: null, label: null };
  for (const type of rule[1]) {
    const a = ins.actions?.find((x) => x.action_type === type);
    if (a) return { value: Number(a.value), label: rule[0] };
  }
  return { value: 0, label: rule[0] };
}

const minorToMajor = (v?: string) => (v && Number(v) > 0 ? Number(v) / 100 : null);

export async function loadCampaignList(userId: number): Promise<CampaignList> {
  const [clients, rows] = await Promise.all([listClients(userId), listCampaignRows(userId)]);
  const nameOf = new Map(clients.map((c) => [c.id, c.business_name ?? "Untitled client"]));
  const byMetaId = new Map<string, CampaignRow>(rows.filter((r) => r.meta_campaign_id).map((r) => [r.meta_campaign_id!, r]));

  const connected = clients.filter((c) => c.meta_connection_id && c.ad_account_id);
  const errors: CampaignList["errors"] = [];
  const perClient = await Promise.all(
    connected.map(async (c): Promise<CampaignListItem[]> => {
      const name = c.business_name ?? "Untitled client";
      try {
        const token = await getConnectionToken(userId, c.meta_connection_id!);
        if (!token) throw new Error("Facebook connection expired — reconnect on the client page.");
        const act = actId(c.ad_account_id!);
        const [account, campaigns] = await Promise.all([
          graphGet<{ currency?: string }>(act, token, { fields: "currency" }),
          graphList<MetaCampaign>(
            `${act}/campaigns`,
            token,
            {
              fields:
                "id,name,objective,status,effective_status,spend_cap,daily_budget,lifetime_budget,created_time,adsets.limit(1){daily_budget,lifetime_budget},insights.date_preset(last_7d){spend,reach,inline_link_clicks,actions}",
              limit: 100,
            },
            2,
          ),
        ]);
        const currency = account.currency ?? "INR";
        return campaigns.map((m) => {
          const ins = m.insights?.data?.[0];
          const own = byMetaId.get(m.id);
          const set = m.adsets?.data?.[0];
          const daily = minorToMajor(m.daily_budget) ?? minorToMajor(set?.daily_budget);
          const lifetime = minorToMajor(m.lifetime_budget) ?? minorToMajor(set?.lifetime_budget);
          const spend = Number(ins?.spend ?? 0);
          const r = results(m.objective, ins);
          const [status, statusLabel] = STATUS[m.effective_status ?? ""] ?? (["off", (m.effective_status ?? "Unknown").toLowerCase()] as [ListStatus, string]);
          return {
            key: `m-${m.id}`,
            clientId: c.id,
            clientName: name,
            metaId: m.id,
            name: m.name ?? `Campaign ${m.id}`,
            objective: m.objective ?? null,
            destination: own?.destination ?? null,
            status,
            statusLabel,
            currency,
            budget: daily ? { amount: daily, type: "daily" } : lifetime ? { amount: lifetime, type: "lifetime" } : null,
            spendCap: m.spend_cap && Number(m.spend_cap) > 0 && m.spend_cap !== "922337203685478" ? Number(m.spend_cap) / 100 : null,
            configuredStatus: m.status ?? null,
            spend,
            results: r.value,
            resultLabel: r.label,
            costPerResult: r.value && r.value > 0 && spend > 0 ? spend / r.value : null,
            created: m.created_time ?? null,
            fromShryxa: Boolean(own),
            adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.ad_account_id!.replace(/^act_/, "")}&selected_campaign_ids=${m.id}`,
          };
        });
      } catch (e) {
        errors.push({ clientName: name, message: e instanceof MetaApiError ? e.userMessage || e.message : e instanceof Error ? e.message : "Couldn't load campaigns." });
        return [];
      }
    }),
  );

  const drafts: DraftListItem[] = rows
    .filter((r) => r.state === "draft")
    .map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: nameOf.get(r.client_id) ?? "Client",
      name: r.name || "Untitled draft",
      objective: r.objective,
      destination: r.destination,
      updatedAt: r.updated_at,
      headline: String((r.summary as { headline?: unknown })?.headline ?? ""),
    }));

  return {
    campaigns: perClient.flat().sort((a, b) => (b.created ?? "").localeCompare(a.created ?? "")),
    drafts,
    errors,
    clients: clients.map((c) => ({ id: c.id, name: c.business_name ?? "Untitled client" })),
  };
}
