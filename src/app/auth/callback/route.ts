import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requestOrigin, safeReturnPath, signInRedirect } from "@/lib/auth-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");
  const safeNext = safeReturnPath(url.searchParams.get("next"), origin);
  const redirect = new URL(safeNext, origin);
  const signIn = signInRedirect(origin, safeNext, "signin");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!code || !supabaseUrl || !key) return NextResponse.redirect(signIn);
  const cookieStore = await cookies();
  const response = NextResponse.redirect(redirect);
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
  if (error) return NextResponse.redirect(signIn);
  // Keep the private account directory current after every OAuth sign-in.
  // A failure here should not prevent a valid Google sign-in from completing.
  await supabase.rpc("sync_my_lunch_profile");
  return response;
}
