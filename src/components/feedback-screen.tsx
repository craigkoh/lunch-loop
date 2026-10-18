"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "./app-frame";
import { appInfo } from "@/lib/app-info";
import { createClient } from "@/lib/supabase/client";

type MyFeedback = {
  id: string;
  kind: "bug" | "feature" | "question" | "other";
  title: string;
  status: string;
  priority: string;
  reporter_note: string | null;
  created_at: string;
};

const kindLabels = {
  bug: "🐛 Something is broken",
  feature: "✨ I have an idea",
  question: "💬 I have a question",
  other: "📝 Something else",
} as const;

export function FeedbackScreen() {
  const [kind, setKind] = useState<keyof typeof kindLabels>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [items, setItems] = useState<MyFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await createClient().rpc(
      "get_my_lunch_loop_feedback",
    );
    if (loadError) setError(loadError.message);
    else setItems((data ?? []) as MyFeedback[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title,
          details,
          pagePath: window.location.pathname,
          build: appInfo.build,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Feedback could not be sent.");
      setTitle("");
      setDetails("");
      setMessage("Thank you—your feedback is in the Lunch Loop queue.");
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Feedback could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppFrame>
      <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
        Help shape Lunch Loop
      </p>
      <h1 className="mt-1 text-3xl font-black tracking-tight">Feedback</h1>
      <p className="mt-2 max-w-2xl text-stone-600">
        Found a rough edge or have a bright idea? Tell us what happened, what
        you expected, and what would make the loop better. Your signed-in
        account and build number are included so the team can follow up.
      </p>
      <form onSubmit={submit} className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <fieldset>
          <legend className="text-sm font-black">What kind of feedback is this?</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(kindLabels).map(([value, label]) => (
              <label key={value} className={`cursor-pointer rounded-2xl border p-3 text-sm font-bold ${kind === value ? "border-orange-400 bg-orange-50 text-orange-950" : "border-stone-200"}`}>
                <input
                  type="radio"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value as keyof typeof kindLabels)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-5 block text-sm font-black">
          A short title
          <input
            required
            minLength={3}
            maxLength={140}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example: The restaurant search loses my typing"
            className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300"
          />
        </label>
        <label className="mt-5 block text-sm font-black">
          What happened, and what would help?
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={7}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Include the steps you took, what you expected, and anything that would make this easier to improve."
            className="mt-2 w-full resize-y rounded-xl border border-orange-200 px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300"
          />
        </label>
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Please avoid passwords, payment details, or other sensitive personal information.
        </p>
        <button disabled={busy} className="mt-5 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60">
          {busy ? "Sending…" : "Send feedback →"}
        </button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p>}
      <section className="mt-7 rounded-3xl bg-orange-500 p-5 text-white shadow-sm">
        <h2 className="text-lg font-black">Your recent notes</h2>
        <p className="mt-1 text-sm text-orange-50">This is your personal submission history—not the whole crew’s private feedback. When we ship a fix, you’ll see what changed here.</p>
        {loading ? <p className="mt-4 text-sm text-orange-50">Loading your notes…</p> : items.length ? (
          <div className="mt-4 space-y-2">
            {items.slice(0, 8).map((item) => (
              <article key={item.id} className="rounded-2xl bg-white/15 px-4 py-3">
                <div className="flex flex-wrap justify-between gap-2"><strong>{item.title}</strong><span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{item.status.replaceAll("_", " ")}</span></div>
                <p className="mt-1 text-xs text-orange-50">{item.kind} · {new Date(item.created_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
                {item.reporter_note && <div className="mt-3 rounded-xl bg-emerald-950/20 px-3 py-2 text-sm leading-6 text-white"><p className="text-xs font-black uppercase tracking-widest text-emerald-100">What changed</p><p className="mt-1 whitespace-pre-wrap">{item.reporter_note}</p></div>}
              </article>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-orange-50">No feedback sent yet. The first good idea can be yours.</p>}
      </section>
    </AppFrame>
  );
}
