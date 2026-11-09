import "server-only";
import { metaEnv } from "@/lib/env";
import { graphGet, graphList, MetaApiError } from "@/lib/meta/graph";

/* Permissions our Login-for-Business configs must grant. */
export const REQUIRED_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"] as const;
export const RECOMMENDED_SCOPES = ["pages_manage_ads", "leads_retrieval", "instagram_basic"] as const;

/** Required permissions missing from a saved grant (null grant = unknown → none reported). */
export function missingScopes(granted: string[] | null | undefined): string[] {
  if (!granted || granted.length === 0) return [];
  return REQUIRED_SCOPES.filter((s) => !granted.includes(s));
}

export function permissionMessage(missing: string[], where: "business" | "client"): string {
  const config = where === "business" ? "Agency (system-user) Login for Business configuration" : "Login for Business configuration";
  return missing.length
    ? `Facebook didn't grant: ${missing.join(", ")}. Add ${missing.length === 1 ? "it" : "them"} to your ${config} in the Meta app, then Reconnect.`
    : `Facebook refused access to the ad accounts. Check the ${config} includes ad account assets and ads permissions, then Reconnect and tick the ad accounts.`;
}

/* Shapes returned to pages — narrow and serialisable (no tokens). */

export type AdAccountOption = {
  id: string; // "act_123"
  accountId: string; // "123"
  name: string;
  currency: string;
  status: number;
  businessName: string | null;
};
export type PageOption = { id: string; name: string; instagram: { id: string; username: string } | null };
export type PixelOption = { id: string; name: string };

export type Discovery = { metaUser: { id: string; name: string }; adAccounts: AdAccountOption[]; pages: PageOption[] };

type RawAdAccount = {
  id: string;
  account_id: string;
  name?: string;
  currency?: string;
  account_status?: number;
  business?: { id: string; name: string };
};
type RawPage = { id: string; name: string; instagram_business_account?: { id: string; username?: string } };

/** Everything the connected login can use: ad accounts + Pages (with linked Instagram). */
export async function discoverAssets(token: string): Promise<Discovery> {
  const [me, accounts, pages] = await Promise.all([
    graphGet<{ id: string; name: string }>("me", token, { fields: "id,name" }),
    graphList<RawAdAccount>("me/adaccounts", token, { fields: "id,account_id,name,currency,account_status,business{id,name}" }),
    graphList<RawPage>("me/accounts", token, { fields: "id,name,instagram_business_account{id,username}" }).catch(() => [] as RawPage[]),
  ]);

  // Marketing API sandbox account (testing): include it if this login can read it.
  const sandbox = metaEnv().META_SANDBOX_AD_ACCOUNT_ID;
  if (sandbox && !accounts.some((a) => a.account_id === sandbox)) {
    const extra = await graphGet<RawAdAccount>(`act_${sandbox}`, token, { fields: "id,account_id,name,currency,account_status,business{id,name}" }).catch(() => null);
    if (extra) accounts.push({ ...extra, name: `${extra.name || "Sandbox"} (sandbox)` });
  }

  return {
    metaUser: me,
    adAccounts: accounts.map((a) => ({
      id: a.id,
      accountId: a.account_id,
      name: a.name || `Ad account ${a.account_id}`,
      currency: a.currency ?? "",
      status: a.account_status ?? 0,
      businessName: a.business?.name ?? null,
    })),
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      instagram: p.instagram_business_account
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? "instagram" }
        : null,
    })),
  };
}

export async function listPixels(token: string, adAccountId: string): Promise<PixelOption[]> {
  const pixels = await graphList<{ id: string; name?: string }>(`${actId(adAccountId)}/adspixels`, token, { fields: "id,name" }).catch(
    () => [],
  );
  return pixels.map((p) => ({ id: p.id, name: p.name || `Pixel ${p.id}` }));
}

export const actId = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);

/* ------------------------------------------------------- Readiness */

export type CheckState = "ok" | "warn" | "todo" | "optional";
export type ReadinessItem = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  action?: { label: string; href: string };
};
export type AccountHealth = {
  status: number;
  statusLabel: string;
  currency: string;
  amountSpent: number | null; // in account currency (major units)
  balance: number | null;
  spendCap: number | null;
  hasPaymentMethod: boolean;
  paymentLabel: string | null;
};

// https://developers.facebook.com/docs/marketing-api/reference/ad-account — account_status
const STATUS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled — payment due",
  7: "Pending risk review",
  8: "Pending settlement",
  9: "In grace period",
  100: "Pending closure",
  101: "Closed",
};

// Currencies Meta reports without minor units (amounts are already whole).
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "COP", "CRC", "HUF", "ISK", "IDR", "PYG", "TWD"]);
const major = (v: string | undefined, currency: string) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return ZERO_DECIMAL.has(currency) ? n : n / 100;
};

export async function adAccountHealth(token: string, adAccountId: string): Promise<AccountHealth> {
  type Raw = {
    account_status?: number;
    currency?: string;
    amount_spent?: string;
    balance?: string;
    spend_cap?: string;
    funding_source_details?: { display_string?: string; type?: number } | null;
  };
  const base = "account_status,currency,amount_spent,balance,spend_cap";
  let raw: Raw;
  try {
    raw = await graphGet<Raw>(actId(adAccountId), token, { fields: `${base},funding_source_details` });
  } catch (e) {
    // Some accounts/permission levels can't read funding details — degrade gracefully.
    if (e instanceof MetaApiError && !e.isAuthError) raw = await graphGet<Raw>(actId(adAccountId), token, { fields: base });
    else throw e;
  }
  const currency = raw.currency ?? "";
  const status = raw.account_status ?? 0;
  return {
    status,
    statusLabel: STATUS[status] ?? `Status ${status}`,
    currency,
    amountSpent: major(raw.amount_spent, currency),
    balance: major(raw.balance, currency),
    spendCap: raw.spend_cap && raw.spend_cap !== "0" ? major(raw.spend_cap, currency) : null,
    hasPaymentMethod: Boolean(raw.funding_source_details),
    paymentLabel: raw.funding_source_details?.display_string ?? null,
  };
}

/** Meta deep links for things the API cannot do on the user's behalf. */
export const metaLinks = {
  createPage: "https://www.facebook.com/pages/create",
  billing: (adAccountId: string) =>
    `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${adAccountId.replace(/^act_/, "")}`,
  adsManager: (adAccountId: string) => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace(/^act_/, "")}`,
  createAdAccount: "https://business.facebook.com/settings/ad-accounts",
  linkInstagram: "https://business.facebook.com/settings/instagram-account-v2s",
  nondiscrimination: "https://www.facebook.com/certification/nondiscrimination",
  eventsManager: "https://business.facebook.com/events_manager2",
};

/** Below this much left under the account spending limit we warn (about one day of a starter budget). */
const LOW_LIMIT: Record<string, number> = { INR: 500, USD: 20 };

export function buildReadiness(input: {
  connected: boolean;
  adAccountId: string | null;
  pageId: string | null;
  pageName: string | null;
  instagramUsername: string | null;
  pixelName: string | null;
  health: AccountHealth | null;
  healthError: string | null;
  /** True once Shryxa has created an ad for this client (proves this login accepted the policy). */
  policyAccepted?: boolean | null;
}): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  items.push(
    input.connected
      ? { key: "connect", label: "Facebook connected", state: "ok", detail: "We can manage ads with this login." }
      : { key: "connect", label: "Connect Facebook", state: "todo", detail: "Log in with the Facebook account that manages this business." },
  );

  items.push(
    input.pageId
      ? { key: "page", label: "Facebook Page", state: "ok", detail: input.pageName ?? input.pageId }
      : {
          key: "page",
          label: "Facebook Page",
          state: "todo",
          detail: "Every ad runs from a Page. Pick one below — or create one on Facebook in about 2 minutes.",
          action: { label: "Create a Page", href: metaLinks.createPage },
        },
  );

  if (!input.adAccountId) {
    items.push({
      key: "adaccount",
      label: "Ad account",
      state: "todo",
      detail: "Pick the ad account that should pay for these ads.",
      action: { label: "Open Meta Business settings", href: metaLinks.createAdAccount },
    });
  } else if (input.healthError) {
    items.push({ key: "adaccount", label: "Ad account", state: "warn", detail: input.healthError });
  } else if (input.health) {
    const h = input.health;
    items.push(
      h.status === 1
        ? { key: "adaccount", label: "Ad account active", state: "ok", detail: `${h.currency} · ${h.statusLabel}` }
        : {
            key: "adaccount",
            label: "Ad account needs attention",
            state: "warn",
            detail: h.statusLabel,
            action: { label: "Open in Meta", href: metaLinks.adsManager(input.adAccountId) },
          },
    );
    items.push(
      h.hasPaymentMethod
        ? { key: "payment", label: "Payment method", state: "ok", detail: h.paymentLabel ?? "Added in Meta" }
        : {
            key: "payment",
            label: "Add a payment method",
            state: "todo",
            detail: "Meta only lets you add a card, UPI or funds on its own billing page. Come back here when done.",
            action: { label: "Add payment in Meta", href: metaLinks.billing(input.adAccountId) },
          },
    );
    // Account spending limit nearly used up → ads stop delivering soon after launch.
    if (h.spendCap !== null) {
      const left = Math.max(0, h.spendCap - (h.amountSpent ?? 0));
      const low = LOW_LIMIT[h.currency] ?? 500;
      if (left < low) {
        const fmt = (n: number) => `${h.currency} ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
        items.push({
          key: "spendlimit",
          label: left === 0 ? "Account spending limit reached" : "Account spending limit almost reached",
          state: "warn",
          detail: `Only ${fmt(left)} left of the ${fmt(h.spendCap)} limit — ads stop once it's used, whatever the campaign budget. Raise or remove it in Meta Billing.`,
          action: { label: "Change limit in Meta", href: metaLinks.billing(input.adAccountId) },
        });
      }
    }
    items.push(
      input.policyAccepted
        ? { key: "policy", label: "Non-discrimination Policy", state: "ok", detail: "Accepted — an ad was created from Shryxa." }
        : {
            key: "policy",
            label: "Accept Meta's Non-discrimination Policy",
            state: "todo",
            detail: "One time, by the person connected here. Meta allows this only on Facebook (no API). Ticks itself after your first launch from Shryxa.",
            action: { label: "Accept on Facebook", href: metaLinks.nondiscrimination },
          },
    );
  }

  items.push(
    input.instagramUsername
      ? { key: "instagram", label: "Instagram", state: "ok", detail: `@${input.instagramUsername}` }
      : {
          key: "instagram",
          label: "Instagram (optional)",
          state: "optional",
          detail: "Without one, Instagram ads use your Facebook Page's name and picture.",
          action: { label: "Link Instagram in Meta", href: metaLinks.linkInstagram },
        },
  );
  items.push(
    input.pixelName
      ? { key: "pixel", label: "Pixel", state: "ok", detail: input.pixelName }
      : {
          key: "pixel",
          label: "Pixel (website ads only)",
          state: "optional",
          detail: "Needed to track results on your website. Not needed for lead-form ads.",
          action: { label: "Open Events Manager", href: metaLinks.eventsManager },
        },
  );
  return items;
}
