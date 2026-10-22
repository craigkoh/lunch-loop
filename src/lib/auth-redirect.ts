/**
 * Shared return-path checks for Google's /auth/callback and the email
 * magic-link /auth/confirm route. A backslash or another site's origin never
 * becomes the redirect target.
 */
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
    return "That email link is invalid or has expired. Request a new one.";
  }
  if (code === "rate") {
    return "Too many email links were requested. Wait a minute, then try again.";
  }
  if (code === "signin") {
    return "Google sign-in did not finish. Please try again.";
  }
  return "";
}
