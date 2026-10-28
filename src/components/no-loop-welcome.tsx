"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeedbackBugLink } from "./feedback-bug-link";
import { createClient } from "@/lib/supabase/client";

export function NoLoopWelcome() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) throw new Error("Your sign-in could not be restored. Please sign in again.");
      setEmail(session.user.email ?? "your account");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We could not restore your Lunch Loop sign-in.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function useCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;
    window.location.assign(`/join?code=${encodeURIComponent(normalizedCode)}`);
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }

  return (
    <main className="min-h-dvh bg-[#fffaf3] p-4 sm:p-6">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-orange-100 ring-1 ring-orange-100">
        <div className="relative overflow-hidden bg-orange-500 px-6 py-8 text-white sm:px-9 sm:py-10">
          <div className="absolute -right-5 -top-8 text-9xl opacity-20" aria-hidden="true">🍟</div>
          <p className="relative text-sm font-black uppercase tracking-[0.18em] text-orange-100">Welcome to Lunch Loop</p>
          <h1 className="relative mt-2 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
            We’re glad you found us! 👋
          </h1>
          <p className="relative mt-3 max-w-xl text-orange-50">
            You’re signed in, but you are not in a Lunch Loop yet. The next step is simple: create a Lunch Loop for your crew or use an owner’s invitation to join one.
          </p>
        </div>

        <div className="p-6 sm:p-9">
          <div className="rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-950">
            <span className="font-black">Signed in as </span>{email || "your account"}
          </div>

          {loading ? (
            <p className="mt-6 text-sm font-semibold text-stone-500">Checking your sign-in…</p>
          ) : (
            <div className="mt-6 rounded-3xl border border-orange-100 bg-orange-50 p-5">
              <p className="text-xs font-black uppercase tracking-widest text-orange-700">Start your own crew</p>
              <h2 className="mt-2 text-xl font-black">Make a Lunch Loop for your crew</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">Pick a name, set the home area, and invite the people you eat with. Each crew has its own restaurant list and lunch history.</p>
              <Link href="/start" className="mt-4 inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white">Create a Lunch Loop →</Link>
            </div>
          )}

          <div className="mt-5 rounded-3xl bg-stone-50 p-5">
            <p className="text-sm font-black">Joining someone else’s Lunch Loop?</p>
            <p className="mt-1 text-sm text-stone-600">Use the one-time code your Lunch Loop owner sent you. A shareable code works for the first person who uses it. An email invitation stays tied to that email address. Both expire after 14 days.</p>
            <form onSubmit={useCode} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={16}
                autoCapitalize="characters"
                autoCorrect="off"
                placeholder="M7KQ-2R9D-XP"
                className="w-full min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-3 font-mono text-sm font-bold tracking-widest outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
              <button disabled={!code.trim()} className="shrink-0 whitespace-nowrap rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
                Use code
              </button>
            </form>
          </div>

          {error && <p role="alert" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p>}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-5 text-sm">
            <Link href="/" className="font-bold text-orange-700 underline">🏠 Home</Link>
            <div className="flex flex-wrap items-center gap-3"><FeedbackBugLink page="/" /><Link href="/account" className="font-bold text-orange-700 underline">Account settings</Link><button type="button" onClick={() => void signOut()} className="font-bold text-stone-600 underline">Use a different account</button></div>
          </div>
        </div>
      </section>
    </main>
  );
}
