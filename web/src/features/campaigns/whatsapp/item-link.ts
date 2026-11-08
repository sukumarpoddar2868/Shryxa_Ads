import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { metaEnv } from "@/lib/env";

/**
 * Signed, stateless links for carousel items: /w/<token>.
 * The token carries the item's image path (in our private bucket), headline,
 * business name and WhatsApp number. WhatsApp shows the page's og:image as a
 * preview, so the business sees exactly which item the customer tapped.
 */
export type ItemLink = { path: string; headline: string; business: string; whatsapp: string };

const key = () => createHmac("sha256", metaEnv().META_TOKEN_ENCRYPTION_KEY).update("shryxa-item-link-v1").digest();
const sign = (data: string) => createHmac("sha256", key()).update(data).digest("base64url").slice(0, 22);

export function createItemToken(item: ItemLink): string {
  const data = Buffer.from(JSON.stringify({ p: item.path, h: item.headline, b: item.business, w: item.whatsapp })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function readItemToken(token: string): ItemLink | null {
  const [data, sig] = token.split(".");
  if (!data || !sig || sig.length !== 22) return null;
  const expected = Buffer.from(sign(data));
  if (!timingSafeEqual(expected, Buffer.from(sig))) return null;
  try {
    const o = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { p?: unknown; h?: unknown; b?: unknown; w?: unknown };
    if (typeof o.p !== "string" || !/^u\d+\/c\d+\/[\w-]+\.(jpg|png)$/.test(o.p)) return null;
    return { path: o.p, headline: String(o.h ?? ""), business: String(o.b ?? ""), whatsapp: String(o.w ?? "") };
  } catch {
    return null;
  }
}

export const itemUrl = (token: string) => `${metaEnv().APP_URL}/w/${token}`;
