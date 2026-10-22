"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { suggestedDisplayName } from "@/lib/display-name";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { FeedbackBugLink } from "./feedback-bug-link";

export function JoinInviteScreen() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [displayName, setDisplayName] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    createClient().auth.getUser().then(({ data: { user } }) => {
      setSignedIn(Boolean(user));
      setDisplayName(suggestedDisplayName(user));
      setLoading(false);
    });
  }, []);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token || undefined, code: code || undefined, displayName: displayName || undefined }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "That invitation could not be redeemed.");
      setMessage("You’re in! Your Lunch Loop is ready.");
      window.setTimeout(() => window.location.assign("/"), 700);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "That invitation could not be redeemed.");
    } finally {
      setBusy(false);
    }
  }

  const currentPath = `/join${token ? `?token=${encodeURIComponent(token)}` : code ? `?code=${encodeURIComponent(code)}` : ""}`;
  return (
    <main className="grid min-h-dvh place-items-center bg-[#fffaf3] p-4">
      <section className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl shadow-orange-100">
        <div className="text-4xl">🍽️</div>
        <p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">One-time invitation</p>
        <h1 className="mt-1 text-3xl font-black">Join a Lunch Loop</h1>
        <p className="mt-2 text-stone-600">You’re about to join a crew’s places, picks, and lunch lore. Email invitations must match the email address the owner invited, whether you sign in with Google or a one-time email link. A shareable one-time code works for the first person who uses it.</p>
        {loading ? <p className="mt-6 text-sm font-semibold text-stone-500">Checking your secure sign-in…</p> : !signedIn ? (
          <Link href={`/sign-in?next=${encodeURIComponent(currentPath)}`} className="mt-6 inline-flex rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white">Sign in to continue →</Link>
        ) : (
          <form onSubmit={join} className="mt-6 space-y-4">
            <label className="block text-sm font-black">What should your crew call you?
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your display name" maxLength={50} className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300" />
            </label>
            {!token && <label className="block text-sm font-black">One-time invite code
              <input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="M7KQ-2R9D-XP" maxLength={16} autoCapitalize="characters" autoCorrect="off" className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 font-mono font-bold tracking-widest outline-none focus:ring-2 focus:ring-orange-300" />
            </label>}
            <button disabled={busy || (!token && !code)} className="w-full rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? "Joining…" : "Join this Lunch Loop"}</button>
          </form>
        )}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
        {signedIn && <div className="mt-5"><FeedbackBugLink page={currentPath} /></div>}
        <p className="mt-5 text-xs leading-5 text-stone-500">This invitation is single-use and expires after 14 days. Need help? Ask the Lunch Loop owner to send a new invitation.</p>
      </section>
    </main>
  );
}
