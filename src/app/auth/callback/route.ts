import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  // `new URL()` treats a backslash as a path separator. Without rejecting it,
  // a value such as `/\\evil.example` can become an external redirect.
  const candidateNext =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
      ? new URL(requestedNext, url.origin)
      : null;
  const safeNext =
    candidateNext?.origin === url.origin
      ? `${candidateNext.pathname}${candidateNext.search}${candidateNext.hash}`
      : "/";
  const redirect = new URL(safeNext, url.origin);
  const signIn = new URL("/sign-in", url.origin);
  signIn.searchParams.set("error", "signin");
  if (safeNext !== "/") signIn.searchParams.set("next", safeNext);
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
