import { NextResponse } from "next/server";
import { authReturnErrorCode, isSupabaseAuthCode, requestOrigin, safeReturnPath, signInRedirect } from "@/lib/auth-redirect";
import { establishAuthSession } from "@/lib/auth-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const safeNext = safeReturnPath(url.searchParams.get("next"), origin);
  const code = url.searchParams.get("code");
  if (isSupabaseAuthCode(code) && code) return establishAuthSession(request, code, safeNext);
  const errorCode = authReturnErrorCode({
    error: url.searchParams.get("error"),
    errorCode: url.searchParams.get("error_code"),
    errorDescription: url.searchParams.get("error_description"),
  });
  return NextResponse.redirect(signInRedirect(origin, safeNext, errorCode));
}
