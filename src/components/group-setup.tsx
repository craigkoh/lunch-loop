"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

export function GroupSetup() {
  const [state, setState] = useState<
    "loading" | "signed-out" | "member" | "setup"
  >(() => (hasSupabaseEnv() ? "loading" : "setup"));
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setState("signed-out");
        return;
      }
      const { data } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .limit(1);
      setState(data?.length ? "member" : "setup");
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      window.location.assign(`/join?code=${encodeURIComponent(code)}`);
    } catch (submitError) {
      setMessage(
        submitError instanceof Error
          ? submitError.message
          : "Your lunch group could not be joined.",
      );
      setBusy(false);
    }
  }

  if (state === "loading" || state === "member") return null;
  if (!hasSupabaseEnv())
    return (
      <section className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-black text-amber-950">
          Group setup is unavailable
        </h2>
        <p className="mt-1 text-sm text-amber-900">
          The app’s connection needs to be configured before a shared group can
          be created.
        </p>
      </section>
    );
  if (state === "signed-out")
    return (
      <section className="mt-7 rounded-3xl border border-orange-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Ready to join a Lunch Loop?</h2>
        <p className="mt-1 text-sm text-stone-600">
          Sign in, then use your crew&apos;s invitation code to join
          its private restaurant database, history, and stats.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white"
          >
            Sign in →
          </Link>
          <Link
            href="/start"
            className="inline-flex rounded-xl bg-orange-100 px-4 py-3 text-sm font-black text-orange-900"
          >
            Create a Lunch Loop
          </Link>
        </div>
      </section>
    );

  return (
    <section className="mt-7 rounded-3xl border border-orange-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
        Private crews
      </p>
      <h2 className="mt-1 text-lg font-black">Join a crew or create your own</h2>
      <p className="mt-1 text-sm text-stone-500">
        Enter the one-time code from your group owner. It is tied to the Google
        account they invited, expires after 14 days, and cannot be reused.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        <input
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={16}
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder="M7KQ-2R9D-XP"
          className="rounded-xl border border-orange-200 px-3 py-3"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {busy ? "Opening invite…" : "Use one-time code"}
        </button>
      </form>
      <p className="mt-4 text-xs text-stone-500">
        Want to create a private crew instead?{" "}
        <Link
          href="/start"
          className="font-bold text-orange-700 underline"
        >
          Start a Lunch Loop.
        </Link>
      </p>
      {message && (
        <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">
          {message}
        </p>
      )}
    </section>
  );
}
