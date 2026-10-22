import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { confirmOtpType, isAuthRateLimit, requestOrigin, safeReturnPath, signInRedirect } from "@/lib/auth-redirect";

/**
 * Confirms an email token hash on whatever device opened the message.
 * Magic-link mail uses type=email, which matches a magic-link hash or a
 * confirmation hash. Confirm-signup mail uses type=signup, which matches
 * only a confirmation hash. The query type is forwarded unchanged. The link
 * does not depend on the browser that requested it, so in-app mail browsers
 * can finish sign-in here and then continue to the same safe `next` path
 * used by /auth/callback.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = confirmOtpType(url.searchParams.get("type"));
  const safeNext = safeReturnPath(url.searchParams.get("next"), origin);
  const fail = (code: string) =>
    NextResponse.redirect(signInRedirect(origin, safeNext, code));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!otpType || !tokenHash || !supabaseUrl || !key) return fail("link");

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
