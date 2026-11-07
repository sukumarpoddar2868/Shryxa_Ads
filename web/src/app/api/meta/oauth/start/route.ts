import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { createOAuthState, resolveInvite } from "@/features/meta-connect/store";
import { buildLoginUrl } from "@/lib/meta/graph";
import { metaConfigured } from "@/lib/env";
import { INVITE_COOKIE } from "@/features/meta-connect/constants";

/**
 * Starts Facebook Login for Business.
 *   ?client=<id>   signed-in owner connects a client (or their own business)
 *   ?invite=<tok>  a client connects via an agency's invite link (no login)
 */
export async function GET(request: NextRequest) {
  const back = (path: string, error: string) => NextResponse.redirect(new URL(`${path}?meta_error=${error}`, request.url));
  const inviteToken = request.nextUrl.searchParams.get("invite");
  const clientParam = request.nextUrl.searchParams.get("client");

  if (!metaConfigured()) return back(inviteToken ? `/connect/${inviteToken}` : "/clients", "not_configured");

  if (inviteToken) {
    const invite = await resolveInvite(inviteToken);
    if (!invite) return back(`/connect/${inviteToken}`, "invite_expired");
    if (invite.usedAt) return back(`/connect/${inviteToken}`, "invite_used");
    const state = await createOAuthState({ flow: "invite", userId: invite.userId, clientId: invite.clientId, inviteId: invite.inviteId });
    // The callback URL is fixed, so remember which invite page to return to.
    (await cookies()).set(INVITE_COOKIE, inviteToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 20 * 60,
    });
    return NextResponse.redirect(buildLoginUrl(state));
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const client = clientParam ? await getClient(user.id, Number(clientParam)) : null;
  if (!client) return back("/clients", "unknown_client");

  const state = await createOAuthState({ flow: "owner", userId: user.id, clientId: client.id });
  return NextResponse.redirect(buildLoginUrl(state));
}
