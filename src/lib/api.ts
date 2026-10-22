import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { originForHost } from "@/lib/auth-redirect";
import { RouteAccessError } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Origin used in emails and copied invite links. A production *.vercel.app
 * alias is rewritten to lunchloop.app. Preview deployments and local
 * development keep the host that served the request, matching the Supabase
 * project that deployment uses.
 */
export function appOrigin(request: Request) {
  const url = new URL(request.url);
  return originForHost(url.hostname, url.origin);
}

export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

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

function isUserFacingDatabaseError(error: unknown): error is { message: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P0001" &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string",
  );
}

export function apiError(error: unknown) {
  if (error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Check what you entered and try again." },
      { status: 400, headers: noStore },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "The request could not be read." }, { status: 400, headers: noStore });
  }
  // Lunch Loop's own thrown messages, and database exceptions written for
  // members (SQLSTATE P0001), stay visible. Other database failures can name
  // constraints or permissions, so those stay in the server log.
  if (error instanceof Error && !("code" in error)) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: noStore });
  }
  if (isUserFacingDatabaseError(error)) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: noStore });
  }
  console.error("API request failed", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 400, headers: noStore });
}
