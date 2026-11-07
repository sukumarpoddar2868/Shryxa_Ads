import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only (cookie present?). Real authorization happens in the
// DAL (features/auth/dal.ts) on every page and server action.
const SESSION_COOKIE = "shryxa_session";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/campaigns/:path*", "/clients/:path*", "/account/:path*", "/admin/:path*"],
};
