"use server";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { actId, listPixels, type PixelOption } from "@/features/meta-connect/discovery";
import { getConnectionToken } from "@/features/meta-connect/store";
import { MetaApiError, graphGet, graphPost } from "@/lib/meta/graph";
import { db } from "@/lib/supabase/server";
import { STANDARD_EVENT } from "./snippets";

type Ctx = { token: string; clientId: number; adAccountId: string; userId: number };

async function context(clientId: number): Promise<Ctx | { error: string }> {
  const user = await requireUser();
  const client = await getClient(user.id, clientId);
  if (!client) return { error: "Client not found." };
  if (!client.ad_account_id) return { error: "Pick this client's ad account first." };
  const token = client.meta_connection_id ? await getConnectionToken(user.id, client.meta_connection_id) : null;
  if (!token) return { error: "This client's Facebook connection is missing or expired. Reconnect it on the client page." };
  return { token, clientId, adAccountId: client.ad_account_id, userId: user.id };
}

const metaMsg = (e: unknown) => (e instanceof MetaApiError ? e.userMessage || e.message : e instanceof Error ? e.message : "Unknown error");

async function savePixel(c: Ctx, pixel: PixelOption) {
  await db()
    .from("clients")
    .update({ pixel_id: pixel.id, pixel_name: pixel.name, assets_updated_at: new Date().toISOString() })
    .eq("id", c.clientId)
    .eq("user_id", c.userId);
}

export type PixelList = { ok: true; pixels: PixelOption[] } | { ok: false; error: string };

/** Pixels in the client's ad account. */
export async function listPixelsAction(clientId: number): Promise<PixelList> {
  const c = await context(clientId);
  if ("error" in c) return { ok: false, error: c.error };
  return { ok: true, pixels: await listPixels(c.token, c.adAccountId) };
}

/** Use an existing Pixel for this client (must belong to its ad account). */
export async function selectPixelAction(clientId: number, pixelId: string): Promise<{ ok: true; pixel: PixelOption } | { ok: false; error: string }> {
  const c = await context(clientId);
  if ("error" in c) return { ok: false, error: c.error };
  const pixel = (await listPixels(c.token, c.adAccountId)).find((p) => p.id === pixelId);
  if (!pixel) return { ok: false, error: "That Pixel isn't in this client's ad account." };
  await savePixel(c, pixel);
  return { ok: true, pixel };
}

/** Create a new Pixel in the client's ad account and use it. */
export async function createPixelAction(clientId: number, name: string): Promise<{ ok: true; pixel: PixelOption } | { ok: false; error: string }> {
  const clean = z.string().trim().min(2).max(60).safeParse(name);
  if (!clean.success) return { ok: false, error: "Give the Pixel a name (2–60 characters)." };
  const c = await context(clientId);
  if ("error" in c) return { ok: false, error: c.error };
  try {
    const res = await graphPost<{ id?: string }>(`${actId(c.adAccountId)}/adspixels`, c.token, { name: clean.data });
    if (!res.id) return { ok: false, error: "Meta didn't return a Pixel id." };
    const pixel = { id: res.id, name: clean.data };
    await savePixel(c, pixel);
    return { ok: true, pixel };
  } catch (e) {
    return { ok: false, error: `Couldn't create the Pixel: ${metaMsg(e)}. Each ad account can have a limited number of Pixels — you may be able to pick an existing one.` };
  }
}

/* ---------------------------------------------------------- Install check */

export type PixelCheck = {
  ok: boolean;
  error?: string;
  /** From Meta: when the Pixel last received any event. */
  lastFired: string | null;
  /** Minutes since lastFired (null = never), and whether it's within 30 days. */
  minutesAgo: number | null;
  fresh: boolean;
  /** From fetching the website page (null = not checked / unreachable). */
  site: { reachable: boolean; hasBaseCode: boolean; hasThisPixel: boolean; events: string[]; note?: string } | null;
};

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:") && privateIp(ip.slice(7));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Reject non-http(s) and private/internal hosts (checked on every redirect hop). */
async function assertPublic(url: URL): Promise<string | null> {
  if (!/^https?:$/.test(url.protocol)) return "Use an http(s) address.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) return "That address isn't public.";
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addresses.some((a) => privateIp(a.address))) return "That address isn't public.";
  } catch {
    return "Couldn't find that website.";
  }
  return null;
}

/** Fetch a public website page safely (no private hosts, ≤3 redirects, small + fast). */
async function fetchPublicPage(raw: string): Promise<{ html: string } | { error: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That website address isn't valid." };
  }
  try {
    for (let hop = 0; hop < 4; hop++) {
      const bad = await assertPublic(url);
      if (bad) return { error: bad };
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "ShryxaAds-PixelCheck/1.0" }, cache: "no-store" });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (next) {
        url = new URL(next, url);
        continue;
      }
      if (!res.ok) return { error: `The website answered ${res.status}.` };
      return { html: (await res.text()).slice(0, 1_500_000) };
    }
    return { error: "Too many redirects." };
  } catch {
    return { error: "Couldn't load the website (timeout or blocked)." };
  }
}

/** Has Meta seen this Pixel fire, and is the code on the given page? Each part works on its own. */
export async function checkPixelAction(clientId: number, pixelId: string, website: string): Promise<PixelCheck> {
  const user = await requireUser();
  if (!(await getClient(user.id, clientId))) return { ok: false, error: "Client not found.", lastFired: null, minutesAgo: null, fresh: false, site: null };
  if (!/^\d{5,20}$/.test(pixelId)) return { ok: false, error: "Invalid Pixel id.", lastFired: null, minutesAgo: null, fresh: false, site: null };

  let lastFired: string | null = null;
  let metaError: string | undefined;
  const c = await context(clientId);
  if ("error" in c) metaError = c.error;
  else {
    try {
      const px = await graphGet<{ last_fired_time?: string }>(pixelId, c.token, { fields: "last_fired_time" });
      lastFired = px.last_fired_time ?? null;
    } catch (e) {
      metaError = `Couldn't read the Pixel from Meta: ${metaMsg(e)}`;
    }
  }

  let site: PixelCheck["site"] = null;
  if (website.trim()) {
    const page = await fetchPublicPage(website.trim());
    if ("error" in page) site = { reachable: false, hasBaseCode: false, hasThisPixel: false, events: [], note: page.error };
    else {
      const html = page.html;
      const hasBaseCode = /connect\.facebook\.net\/[a-z_A-Z]+\/fbevents\.js/.test(html);
      const hasThisPixel = new RegExp(`fbq\\(\\s*['"]init['"]\\s*,\\s*['"]${pixelId}['"]`).test(html);
      const events = [...new Set([...html.matchAll(/fbq\(\s*['"]track['"]\s*,\s*['"](\w+)['"]/g)].map((m) => m[1]))].filter((e) =>
        ["PageView", ...Object.values(STANDARD_EVENT), "ViewContent"].includes(e),
      );
      site = {
        reachable: true,
        hasBaseCode,
        hasThisPixel,
        events,
        note: !hasBaseCode
          ? "Pixel code not found in the page's HTML. If you installed it via Google Tag Manager, Shopify, Wix or a plugin, rely on Meta's activity check."
          : undefined,
      };
    }
  }

  const fired = lastFired ? Date.parse(lastFired) : NaN;
  const minutesAgo = Number.isFinite(fired) ? Math.max(0, Math.round((Date.now() - fired) / 60000)) : null;
  return { ok: true, error: metaError, lastFired, minutesAgo, fresh: minutesAgo !== null && minutesAgo < 30 * 24 * 60, site };
}
