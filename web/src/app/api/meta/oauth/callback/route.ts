import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { consumeOAuthState, saveClientConnection } from "@/features/meta-connect/store";
import { exchangeCode, graphGet, grantedScopes, MetaApiError } from "@/lib/meta/graph";
import { INVITE_COOKIE } from "@/features/meta-connect/constants";

/**
 * Facebook redirects here after login. Validates the one-time state,
 * exchanges the code, stores the encrypted token and sends the person
 * back to where they started to pick their ad account / Page.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const jar = await cookies();
  const inviteToken = jar.get(INVITE_COOKIE)?.value ?? null;
  jar.delete(INVITE_COOKIE);

  const go = (path: string, query: string) => NextResponse.redirect(new URL(`${path}?${query}`, request.url));
  const fallback = inviteToken ? `/connect/${inviteToken}` : "/clients";

  const state = p.get("state");
  const flow = state ? await consumeOAuthState(state) : null;
  if (!flow) return go(fallback, "meta_error=expired_state");

  const home = flow.flow === "invite" && inviteToken ? `/connect/${inviteToken}` : `/clients/${flow.clientId}`;

  if (p.get("error")) return go(home, "meta_error=denied");
  const code = p.get("code");
  if (!code) return go(home, "meta_error=no_code");

  try {
    const { token, expiresAt } = await exchangeCode(code);
    const [me, scopes] = await Promise.all([
      graphGet<{ id: string; name: string }>("me", token, { fields: "id,name" }),
      grantedScopes(token).catch(() => [] as string[]),
    ]);
    await saveClientConnection({
      userId: flow.userId,
      clientId: flow.clientId,
      source: flow.flow,
      metaUserId: me.id,
      metaUserName: me.name,
      token,
      expiresAt,
      scopes,
    });
    return go(home, "connected=1");
  } catch (e) {
    console.error("META_OAUTH_CALLBACK_FAILED", e instanceof MetaApiError ? { code: e.code, type: e.type, message: e.message } : e);
    return go(home, "meta_error=exchange_failed");
  }
}
