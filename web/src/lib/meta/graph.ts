import "server-only";
import { createHmac } from "node:crypto";
import { metaEnv } from "@/lib/env";

/**
 * Minimal Meta Graph API client. Every call made with a user token sends an
 * `appsecret_proof` (HMAC of the token with the app secret), which Meta
 * recommends and which stops stolen tokens being used from elsewhere.
 */

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly type?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
  /** The login works but lacks a permission or asset access (#200, #10, #2xx). */
  get isPermissionError(): boolean {
    return this.code === 10 || (this.code !== undefined && this.code >= 200 && this.code < 300);
  }
  /** Token expired, revoked, or password changed → user must reconnect. */
  get isAuthError(): boolean {
    return this.code === 190 || (this.type === "OAuthException" && this.code === 102);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

const graphBase = () => `https://graph.facebook.com/${metaEnv().META_API_VERSION}`;

function proof(token: string): string {
  return createHmac("sha256", metaEnv().META_APP_SECRET).update(token).digest("hex");
}

async function call<T>(url: URL, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new MetaApiError(e.message ?? `Meta request failed (${res.status})`, e.code, e.error_subcode, e.type, res.status);
  }
  return body as T;
}

function buildUrl(path: string, params: Params, token?: string): URL {
  const url = new URL(path.startsWith("http") ? path : `${graphBase()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  if (token) {
    url.searchParams.set("access_token", token);
    url.searchParams.set("appsecret_proof", proof(token));
  }
  return url;
}

export function graphGet<T>(path: string, token: string, params: Params = {}): Promise<T> {
  return call<T>(buildUrl(path, params, token));
}

export function graphPost<T>(path: string, token: string, params: Params = {}): Promise<T> {
  const url = buildUrl(path, {}, token);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  return call<T>(url, { method: "POST", body });
}

/** Follows `paging.next` up to `maxPages` and concatenates `data`. */
export async function graphList<T>(path: string, token: string, params: Params = {}, maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<{ data?: T[]; paging?: { next?: string } }>(path, token, { limit: 100, ...params });
  for (let i = 0; i < maxPages; i++) {
    out.push(...(page.data ?? []));
    const next = page.paging?.next;
    if (!next) break;
    page = await call(new URL(next));
  }
  return out;
}

/* ------------------------------------------------------------ OAuth */

export const oauthRedirectUri = () => `${metaEnv().APP_URL}/api/meta/oauth/callback`;

/** Facebook Login for Business dialog. Permissions come from the config_id. */
export function buildLoginUrl(state: string, configId?: string): string {
  const { META_APP_ID, META_LOGIN_CONFIG_ID, META_API_VERSION } = metaEnv();
  const url = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", META_APP_ID);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("config_id", configId ?? META_LOGIN_CONFIG_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("override_default_response_type", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = { access_token: string; token_type?: string; expires_in?: number };

/** code → user token, then upgraded to a long-lived (~60 day) token when possible. */
export async function exchangeCode(code: string): Promise<{ token: string; expiresAt: Date | null }> {
  const { META_APP_ID, META_APP_SECRET } = metaEnv();
  const short = await call<TokenResponse>(
    buildUrl("oauth/access_token", {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: oauthRedirectUri(),
      code,
    }),
  );

  let best = short;
  try {
    best = await call<TokenResponse>(
      buildUrl("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: short.access_token,
      }),
    );
  } catch {
    // System-user / business tokens can't be exchanged — keep the original.
  }
  const expiresAt = best.expires_in ? new Date(Date.now() + best.expires_in * 1000) : null;
  return { token: best.access_token, expiresAt };
}

export async function grantedScopes(token: string): Promise<string[]> {
  const perms = await graphList<{ permission: string; status: string }>("me/permissions", token);
  return perms.filter((p) => p.status === "granted").map((p) => p.permission);
}
