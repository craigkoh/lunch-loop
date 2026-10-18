import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export class RouteAccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 500,
  ) {
    super(message);
  }
}

/**
 * Reads the current browser session without treating a signed-out visitor as
 * an error. This only chooses the public or signed-in shell; it never grants
 * data access, so it can use the cookie-backed session instead of delaying the
 * first page render on a remote identity verification. Every private route and
 * data operation still calls getUser/RLS before returning protected data.
 */
export async function getOptionalUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Protects an App Router page before any private UI is rendered. This uses an
 * authenticated Supabase user lookup without the public-page timeout: a
 * temporary auth delay must not turn an active member into a signed-out page.
 *
 * The `nextPath` values are route constants owned by this application, not
 * browser input, so the resulting sign-in return URL cannot become an open
 * redirect.
 */
export async function requirePageUser(nextPath: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const signInUrl = `/sign-in?next=${encodeURIComponent(nextPath)}`;
  if (!url || !key) redirect(signInUrl);

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect(signInUrl);
  return user;
}

/**
 * Provides a cookie-bound Supabase client to trusted Route Handlers. The
 * caller still uses the signed-in person's RLS and RPC permissions—never a
 * service-role key—so an API route cannot act as another Lunch Loop member.
 */
export async function requireAuthenticatedSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new RouteAccessError("Server authentication is not configured.", 500);

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    throw new RouteAccessError("Sign in before continuing.", 401);
  return { supabase, user };
}

/**
 * Verifies the Supabase session on server-side routes and confirms the user is
 * still an active member of at least one Lunch Loop group. Never rely on a
 * client-supplied user ID for an API route that spends a third-party API quota.
 */
export async function requireActiveGroupUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new RouteAccessError("Server authentication is not configured.", 500);

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // These quota-protected routes only read the existing session. Session
      // refresh cookies are handled by the OAuth callback/browser client.
      setAll: () => undefined,
    },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user)
    throw new RouteAccessError("Sign in before searching for places.", 401);

  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership)
    throw new RouteAccessError(
      "Join an active lunch group before searching for places.",
      403,
    );

  return { user, id: user.id, supabase };
}
