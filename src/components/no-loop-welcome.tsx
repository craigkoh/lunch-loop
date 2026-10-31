"use client";

import Link from "next/link";
import { AppFrame } from "./app-frame";
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
    <AppFrame minimal>
      <header className="mb-6">
        <p className="text-sm font-medium text-accent-strong">Welcome to Lunch Loop</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">We’re glad you found us 👋</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-6 text-muted">
          You’re signed in{email ? <> as <span className="font-medium text-ink">{email}</span></> : null}, but not in a Lunch Loop yet. Create one for your crew, or use an owner’s invitation to join one.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted">Checking your sign-in…</p>
      ) : (
        <section className="rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)]">
          <h2 className="text-[17px] font-semibold">Start your own crew</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Pick a name, set the home area, and invite the people you eat with. Each crew has its own restaurant list and lunch history.</p>
          <Link href="/start" className="mt-4 inline-flex min-h-11 items-center rounded-[var(--ll-radius-md)] bg-accent-strong px-4 text-[15px] font-semibold text-on-accent">Create a Lunch Loop →</Link>
        </section>
      )}

      <section className="mt-4 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)]">
        <h2 className="text-[17px] font-semibold">Joining someone else’s Lunch Loop?</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Use the one-time code your owner sent you. A shareable code works for the first person who uses it; an email invitation stays tied to that email. Both expire after 14 days.</p>
        <form onSubmit={useCode} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={16}
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="M7KQ-2R9D-XP"
            aria-label="Invitation code"
            className="min-h-11 w-full min-w-0 flex-1 rounded-[var(--ll-radius-md)] border border-line bg-surface px-3 font-mono text-[15px] font-semibold tracking-widest outline-none focus:ring-2 focus:ring-orange-200"
          />
          <button disabled={!code.trim()} className="min-h-11 shrink-0 whitespace-nowrap rounded-[var(--ll-radius-md)] bg-accent-strong px-5 text-[15px] font-semibold text-on-accent disabled:opacity-50">
            Use code
          </button>
        </form>
      </section>

      {error && <p role="alert" className="mt-4 rounded-[var(--ll-radius-md)] bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <FeedbackBugLink page="/" />
        <Link href="/account" className="font-medium text-accent-strong">Account settings</Link>
        <button type="button" onClick={() => void signOut()} className="font-medium text-muted hover:text-ink">Use a different account</button>
      </div>
    </AppFrame>
  );
}
