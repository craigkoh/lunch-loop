import { NextResponse, type NextRequest } from "next/server";
import { authCallbackTarget, originForHost } from "@/lib/auth-redirect";

/**
 * Production *.vercel.app aliases still open lunchloop.app, including the old
 * project addresses. The path and query stay intact so an OAuth or magic-link
 * callback can finish on the canonical host, where its cookie was created.
 * Preview deployments and local hosts are left alone so they can sign in
 * against the Supabase project configured for that deployment.
 */
export function proxy(request: NextRequest) {
  const current = request.nextUrl;
  const origin = originForHost(current.hostname, current.origin);
  const onThisHost = new URL(current.pathname + current.search, origin);
  const authTarget = authCallbackTarget(onThisHost);
  // A one-time auth code must not be cached as a permanent redirect.
  if (authTarget) return NextResponse.redirect(authTarget, 307);
  if (origin === current.origin) return NextResponse.next();
  return NextResponse.redirect(onThisHost, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
