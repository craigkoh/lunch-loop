/**
 * Shared return-path checks for Google's /auth/callback and the email
 * magic-link /auth/confirm route. A backslash or another site's origin never
 * becomes the redirect target.
 */
export const canonicalSiteOrigin = "https://lunchloop.app";

/**
 * Vercel sets VERCEL_ENV on the server. next.config copies it to
 * NEXT_PUBLIC_VERCEL_ENV so the sign-in page can read the same value.
 * Preview and local builds are not "production", so they keep their own host.
 */
export function deploymentEnv(env: NodeJS.ProcessEnv = process.env) {
  return env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV || "";
}

export function originForHost(
  hostname: string,
  currentOrigin: string,
  env = deploymentEnv(),
) {
  if (env === "production" && hostname.endsWith(".vercel.app")) {
    return canonicalSiteOrigin;
  }
  return currentOrigin;
}

/** Confirm-route types that verifyOtp accepts for an email token hash. */
export function confirmOtpType(type: string | null): "email" | "signup" | null {
  if (type === "email" || type === "signup") return type;
  return null;
}

function originsMatch(candidate: URL, origin: string) {
  if (candidate.origin === origin) return true;
  let requestOrigin: URL;
  try {
    requestOrigin = new URL(origin);
  } catch {
    return false;
  }
  const loopback = new Set(["localhost", "127.0.0.1"]);
  return candidate.protocol === requestOrigin.protocol
    && candidate.port === requestOrigin.port
    && loopback.has(candidate.hostname)
    && loopback.has(requestOrigin.hostname);
}

export function safeReturnPath(requestedNext: string | null, origin: string) {
  if (!requestedNext || requestedNext.includes("\\")) return "/";
  let candidate: URL;
  try {
    if (requestedNext.startsWith("/") && !requestedNext.startsWith("//")) {
      candidate = new URL(requestedNext, origin);
    } else {
      candidate = new URL(requestedNext);
    }
  } catch {
    return "/";
  }
  if (!originsMatch(candidate, origin)) return "/";
  return `${candidate.pathname}${candidate.search}${candidate.hash}` || "/";
}

/**
 * Where to land after a session is stored. The magic-link email carries
 * next={{ .RedirectTo }}, which is the /auth/callback URL the sign-in page
 * passed to Supabase. Landing there again (with no ?code=) bounced people to
 * /sign-in even though they were signed in. Unwrap any /auth/* hop and use
 * its own next, or the home page.
 */
export function postAuthPath(requestedNext: string | null, origin: string) {
  let next = safeReturnPath(requestedNext, origin);
  for (let i = 0; i < 3; i += 1) {
    const hop = new URL(next, origin);
    if (hop.pathname !== "/auth/callback" && hop.pathname !== "/auth/confirm") return next;
    next = safeReturnPath(hop.searchParams.get("next"), origin);
  }
  return "/";
}

/**
 * Prefer the browser's Host when it is only the loopback twin of the URL
 * Next constructed. A session cookie set on 127.0.0.1 is not sent to
 * localhost, so the post-login redirect has to stay on the host that was open.
 * Any other Host is ignored so a forged header cannot leave this site.
 */
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return url.origin;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || url.protocol.replace(/:$/, "");
  let fromHost: URL;
  try {
    fromHost = new URL(`${proto}://${host}`);
  } catch {
    return url.origin;
  }
  if (fromHost.origin === url.origin || originsMatch(fromHost, url.origin)) {
    return fromHost.origin;
  }
  return url.origin;
}

const ownSignInErrors = new Set(["link", "rate", "signin"]);

/** Invite codes are 8–12 characters. A Supabase PKCE code is much longer. */
export function isSupabaseAuthCode(code: string | null) {
  return Boolean(code && code.length >= 20);
}

/**
 * Default magic-link mail verifies on Supabase, then redirects to whatever
 * page was requested with ?code= or an error. Send that return here so the
 * session can be stored. Invite links that use a short ?code= stay put.
 */
export function authCallbackTarget(url: URL) {
  if (url.pathname === "/auth/callback" || url.pathname === "/auth/confirm") return null;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");
  const errorDescription = url.searchParams.get("error_description");
  const authCode = isSupabaseAuthCode(code);
  const supabaseError = Boolean(
    errorCode || errorDescription || (error && !ownSignInErrors.has(error)),
  );
  if (!authCode && !supabaseError) return null;

  const leftover = new URLSearchParams(url.searchParams);
  for (const key of ["code", "error", "error_code", "error_description", "next"]) leftover.delete(key);
  const pathIsSignIn = url.pathname === "/" || url.pathname === "/sign-in";
  const nextPath = pathIsSignIn
    ? url.searchParams.get("next")
    : `${url.pathname}${leftover.size ? `?${leftover.toString()}` : ""}`;
  const target = new URL("/auth/callback", url.origin);
  if (authCode && code) target.searchParams.set("code", code);
  if (error) target.searchParams.set("error", error);
  if (errorCode) target.searchParams.set("error_code", errorCode);
  if (errorDescription) target.searchParams.set("error_description", errorDescription);
  const safeNext = safeReturnPath(nextPath, url.origin);
  if (safeNext !== "/") target.searchParams.set("next", safeNext);
  return target;
}

export function authReturnErrorCode(details: {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  exchangeMessage?: string | null;
}) {
  const blob = [details.errorCode, details.errorDescription, details.exchangeMessage].filter(Boolean).join(" ");
  if (isAuthRateLimit({ message: blob, code: details.errorCode ?? undefined })) return "rate";
  if (/otp|email link|expir|invalid|verifier|flow state|pkce/i.test(blob)) return "link";
  if (details.errorDescription || details.errorCode) return "link";
  return "signin";
}

export function signInRedirect(origin: string, safeNext: string, errorCode: string) {
  const signIn = new URL("/sign-in", origin);
  signIn.searchParams.set("error", errorCode);
  if (safeNext !== "/") signIn.searchParams.set("next", safeNext);
  return signIn;
}

export function isAuthRateLimit(
  error: { message?: string; status?: number; code?: string } | null | undefined,
) {
  if (!error) return false;
  if (error.status === 429) return true;
  if (
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return true;
  }
  return /rate limit|too many requests|only request this after/i.test(error.message ?? "");
}

export function authErrorMessage(code: string | null) {
  if (code === "link") {
    return "That email link is invalid or has expired. Request a new one and open it in this browser.";
  }
  if (code === "rate") {
    return "Too many email links were requested. Wait a minute, then try again.";
  }
  if (code === "signin") {
    return "Google sign-in did not finish. Please try again.";
  }
  return "";
}
