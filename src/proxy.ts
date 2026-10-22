import { NextResponse, type NextRequest } from "next/server";
import { originForHost } from "@/lib/auth-redirect";

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
  if (origin === current.origin) return NextResponse.next();
  const target = new URL(current.pathname + current.search, origin);
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
