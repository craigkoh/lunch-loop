import { NextResponse } from "next/server";
import { RouteAccessError } from "@/lib/supabase/server";

export function requireSameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== expectedOrigin) {
    throw new RouteAccessError("This request was blocked for your security.", 403);
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== expectedOrigin) {
        throw new RouteAccessError("This request was blocked for your security.", 403);
      }
    } catch (error) {
      if (error instanceof RouteAccessError) throw error;
      throw new RouteAccessError("This request was blocked for your security.", 403);
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new RouteAccessError("This request was blocked for your security.", 403);
  }
  // Browser fetches include at least one of these signals. Reject a request
  // with none rather than treating an unidentifiable request as same-origin.
  if (!origin && !referer && !fetchSite) {
    throw new RouteAccessError("This request was blocked for your security.", 403);
  }
}

export function apiError(error: unknown) {
  const headers = { "Cache-Control": "private, no-store" };
  if (error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 400, headers });
}
