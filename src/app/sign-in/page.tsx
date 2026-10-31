"use client";

import Link from "next/link";
import { AuthShell, authCardClass } from "@/components/ui/auth-shell";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { authErrorMessage, canonicalSiteOrigin, isAuthRateLimit, originForHost, safeReturnPath } from "@/lib/auth-redirect";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

const resendCooldownMs = 60_000;
// Cloudflare Turnstile site key (public). Supabase checks the token when
// Auth > Bot and Abuse Protection is on; until then it is simply ignored.
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFm4bzyJ3HIvysR-";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}
const sentStorageKey = "lunch-loop-magic-link-sent";

function authOrigin() {
  if (typeof window === "undefined") return canonicalSiteOrigin;
  return originForHost(window.location.hostname, window.location.origin);
}

function SignInScreen() {
  const searchParams = useSearchParams();
  const nextPath = safeReturnPath(searchParams.get("next"), canonicalSiteOrigin);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState(authErrorMessage(searchParams.get("error")));
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaBox = useRef<HTMLDivElement>(null);
  const captchaId = useRef<string | null>(null);

  useEffect(() => {
    function mount() {
      if (!window.turnstile || !captchaBox.current || captchaId.current) return;
      captchaId.current = window.turnstile.render(captchaBox.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => setCaptchaToken(""),
      });
    }
    if (window.turnstile) return mount();
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = mount;
    document.head.appendChild(script);
  }, []);

  function resetCaptcha() {
    setCaptchaToken("");
    if (window.turnstile && captchaId.current) window.turnstile.reset(captchaId.current);
  }

  useEffect(() => {
    const raw = window.sessionStorage.getItem(sentStorageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { email?: string; sentAt?: number };
      if (saved.email && saved.sentAt && Date.now() - saved.sentAt < 15 * 60_000) {
        setSentTo(saved.email);
        setEmail(saved.email);
        setSentAt(saved.sentAt);
      }
    } catch {
      window.sessionStorage.removeItem(sentStorageKey);
    }
  }, []);

  useEffect(() => {
    if (!sentAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);

  const cooldownLeft = sentAt ? Math.max(0, resendCooldownMs - (now - sentAt)) : 0;

  function rememberSend(address: string) {
    const stamped = Date.now();
    setSentTo(address);
    setSentAt(stamped);
    setNow(stamped);
    window.sessionStorage.setItem(sentStorageKey, JSON.stringify({ email: address, sentAt: stamped }));
  }

  async function sendMagicLink(event?: React.FormEvent) {
    event?.preventDefault();
    const address = email.trim();
    if (!address) return;
    if (!hasSupabaseEnv()) {
      setMessage("Add your Supabase values to .env.local first — see the README.");
      return;
    }
    if (sentTo === address && cooldownLeft > 0) return;
    setBusy("email");
    setMessage("");
    const origin = authOrigin();
    const destination = safeReturnPath(searchParams.get("next"), origin);
    const emailRedirectTo = new URL("/auth/callback", origin);
    if (destination !== "/") emailRedirectTo.searchParams.set("next", destination);
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        // Supabase's default template sends the browser to this URL with
        // ?code=. /auth/callback exchanges it with the PKCE cookie set here.
        emailRedirectTo: emailRedirectTo.toString(),
        captchaToken: captchaToken || undefined,
      },
    });
    setBusy(null);
    // Turnstile tokens are single-use.
    resetCaptcha();
    if (error) {
      setMessage(
        isAuthRateLimit(error)
          ? authErrorMessage("rate")
          : "That email link could not be sent. Check the address and try again.",
      );
      return;
    }
    rememberSend(address);
  }

  async function signInWithGoogle() {
    if (!hasSupabaseEnv()) {
      setMessage("Add your Supabase values to .env.local first — see the README.");
      return;
    }
    setBusy("google");
    setMessage("");
    const origin = authOrigin();
    const destination = safeReturnPath(searchParams.get("next"), origin);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        // Lunch Loop uses Google strictly for basic identity. Keeping the
        // requested scopes explicit prevents future feature work from quietly
        // broadening access to a person's Google account.
        scopes: "openid email profile",
        // Production *.vercel.app aliases sign in on lunchloop.app. Preview
        // and local hosts keep their own origin so the callback cookie and
        // the Supabase allowlist match the deployment that started sign-in.
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    if (error) {
      setMessage(error.message);
      setBusy(null);
    }
  }

  function useDifferentEmail() {
    setSentTo("");
    setSentAt(null);
    window.sessionStorage.removeItem(sentStorageKey);
  }

  return (
    <AuthShell>
      <section className={authCardClass}>
        <p className="text-sm font-medium text-accent-strong">
          Lunch Loop
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Join your lunch crew</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          Continue with Google, or use a one-time email link—no passwords to remember.
        </p>
        {sentTo ? (
          <div className="mt-6 rounded-2xl bg-orange-50 p-4">
            <h2 className="text-lg font-black text-orange-950">Check your email</h2>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              We sent a one-time sign-in link to <span className="font-bold">{sentTo}</span>.
              Open it in this browser. If a mail app opens a different browser and you are not signed in, request a new link there.
            </p>
            <button
              type="button"
              disabled={busy !== null || cooldownLeft > 0}
              onClick={() => void sendMagicLink()}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-500 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {cooldownLeft > 0
                ? `Resend in ${Math.ceil(cooldownLeft / 1000)}s`
                : busy === "email"
                  ? "Sending…"
                  : "Resend link"}
            </button>
            <button
              type="button"
              onClick={useDifferentEmail}
              className="mt-3 w-full text-sm font-bold text-orange-800 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="mt-6">
            <label className="block text-sm font-semibold">
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 text-base font-normal outline-none focus:ring-2 focus:ring-orange-300"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-500 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {busy === "email" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}
        <div ref={captchaBox} className="mt-4 flex min-h-[65px] justify-center" aria-label="Quick human check" />
        <div className="my-5 flex items-center gap-3 text-xs font-bold text-stone-400">
          <span className="h-px flex-1 bg-stone-200" />
          or
          <span className="h-px flex-1 bg-stone-200" />
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void signInWithGoogle()}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-stone-200 py-3 text-sm font-black shadow-sm disabled:opacity-60"
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
        <p className="mt-5 text-sm leading-6 text-subtle">
          Your group owner controls invitations and settings. Signing in
          identifies you; an invitation decides whether you can join this lunch
          crew.
        </p>
        <p className="mt-3 text-sm leading-6 text-subtle">
          By continuing, you agree to the <Link href="/terms" className="font-bold text-orange-700 underline">Terms of Use</Link> and acknowledge the <Link href="/privacy" className="font-bold text-orange-700 underline">Privacy Policy</Link>.
        </p>
        {nextPath === "/request-invite" && (
          <p className="mt-3 rounded-xl bg-accent-soft p-3 text-sm leading-6 text-accent-ink">
            You&apos;ll return to the invite request after you sign in.
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800"
          >
            {message}
          </p>
        )}
      </section>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-app p-4">
          <p className="text-sm font-medium text-muted">
            Preparing secure sign-in…
          </p>
        </main>
      }
    >
      <SignInScreen />
    </Suspense>
  );
}
