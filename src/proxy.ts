import { NextResponse, type NextRequest } from "next/server";

const canonicalOrigin = "https://lunchloop.app";
const legacyHosts = new Set([
  "lunch-loop-evansville.vercel.app",
  "lunch-loop-evansville-craig-kohlers-projects.vercel.app",
]);

/**
 * Supabase must also be configured with lunchloop.app as its Site URL, but this
 * is a safe backstop for an old OAuth redirect or bookmarked Vercel link. It
 * keeps the full callback query string so OAuth code exchange can continue on
 * the canonical domain, where the browser's verifier cookie was created.
 */
export function proxy(request: NextRequest) {
  if (!legacyHosts.has(request.nextUrl.hostname)) return NextResponse.next();
  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    canonicalOrigin,
  );
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
