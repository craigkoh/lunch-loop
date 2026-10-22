import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authReturnErrorCode, confirmOtpType, isAuthRateLimit, isSupabaseAuthCode, requestOrigin, safeReturnPath, signInRedirect } from "@/lib/auth-redirect";
import { establishAuthSession } from "@/lib/auth-session";

/**
 * Confirms an email token hash on whatever device opened the message.
 * Magic-link mail uses type=email, which matches a magic-link hash or a
 * confirmation hash. Confirm-signup mail uses type=signup, which matches
 * only a confirmation hash. The query type is forwarded unchanged.
 * Supabase's default template never reaches this route with a token hash.
 * It returns ?code= after /auth/v1/verify, and that code is exchanged here
 * too. The link does not depend on the browser that requested a token-hash
 * link, so in-app mail browsers can finish that style of sign-in and then
 * continue to the same safe `next` path used by /auth/callback.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = confirmOtpType(url.searchParams.get("type"));
  const safeNext = safeReturnPath(url.searchParams.get("next"), origin);
  if (isSupabaseAuthCode(code) && code) return establishAuthSession(request, code, safeNext);
  const fail = (failure: string) =>
    NextResponse.redirect(signInRedirect(origin, safeNext, failure));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!otpType || !tokenHash || !supabaseUrl || !key) {
    const mapped = authReturnErrorCode({
      error: url.searchParams.get("error"),
      errorCode: url.searchParams.get("error_code"),
      errorDescription: url.searchParams.get("error_description"),
    });
    return fail(mapped === "signin" ? "link" : mapped);
  }

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
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType,
  });
  if (error) return fail(isAuthRateLimit(error) ? "rate" : "link");
  await supabase.rpc("sync_my_lunch_profile");
  return response;
}
