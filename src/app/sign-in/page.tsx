"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

function SignInScreen() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const next = searchParams.get("next");
  const nextPath =
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
      ? next
      : "/";

  async function signInWithGoogle() {
    if (!hasSupabaseEnv()) {
      setMessage(
        "Add your Supabase values to .env.local first — see the README.",
      );
      return;
    }

    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        // Lunch Loop uses Google strictly for basic identity. Keeping the
        // requested scopes explicit prevents future feature work from quietly
        // broadening access to a person's Google account.
        scopes: "openid email profile",
        // Never start a production OAuth flow on the legacy Vercel alias.
        // Supabase allowlists this canonical callback and it keeps browser
        // cookies, share links, and every post-login URL on lunchloop.app.
        redirectTo:
          (window.location.hostname.endsWith("vercel.app")
            ? "https://lunchloop.app"
            : window.location.origin) +
          "/auth/callback?next=" +
          encodeURIComponent(nextPath),
      },
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#fffaf3] p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl shadow-orange-100">
        <div className="text-4xl">🍽️</div>
        <p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">
          Lunch Loop
        </p>
        <h1 className="mt-1 text-3xl font-black">Join your lunch crew</h1>
        <p className="mt-2 text-stone-600">
          Use the Google account you already have—no passwords to remember.
        </p>
        <button
          disabled={busy}
          onClick={signInWithGoogle}
          className="mt-6 w-full rounded-xl border border-stone-200 py-3 text-sm font-black shadow-sm disabled:opacity-60"
        >
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        <p className="mt-5 text-xs leading-5 text-stone-500">
          Your group owner controls invitations and settings. Signing in
          identifies you; an invitation decides whether you can join this lunch
          crew.
        </p>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          By continuing, you agree to the <Link href="/terms" className="font-bold text-orange-700 underline">Terms of Use</Link> and acknowledge the <Link href="/privacy" className="font-bold text-orange-700 underline">Privacy Policy</Link>.
        </p>
        {nextPath === "/request-invite" && (
          <p className="mt-3 rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-900">
            You&apos;ll return to the invite request after Google sign-in.
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
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-[#fffaf3] p-4">
          <p className="text-sm font-semibold text-stone-500">
            Preparing secure sign-in…
          </p>
        </main>
      }
    >
      <SignInScreen />
    </Suspense>
  );
}
