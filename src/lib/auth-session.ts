import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authReturnErrorCode, isAuthRateLimit, requestOrigin, signInRedirect } from "@/lib/auth-redirect";

/**
 * Turns a PKCE ?code= from Google or from Supabase's default magic-link
 * redirect into a cookie session. The verifier cookie was set in this browser
 * by @supabase/ssr when sign-in started, so the exchange has to run here.
 */
export async function establishAuthSession(request: Request, code: string, safeNext: string) {
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const fail = (errorCode: string) =>
    NextResponse.redirect(signInRedirect(origin, safeNext, errorCode));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) return fail("link");

  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL(safeNext, origin));
  const supabase = createServerClient(supabaseUrl, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) =>
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        ),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return fail(isAuthRateLimit(error) ? "rate" : authReturnErrorCode({
      error: url.searchParams.get("error"),
      errorCode: url.searchParams.get("error_code"),
      errorDescription: url.searchParams.get("error_description"),
      exchangeMessage: error.message,
    }));
  }
  await supabase.rpc("sync_my_lunch_profile");
  return response;
}
