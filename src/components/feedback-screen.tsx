"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "./app-frame";
import { appInfo } from "@/lib/app-info";
import { feedbackStatusLabel, feedbackStep, feedbackSteps } from "@/lib/feedback-status";
import { ProgressLine } from "./ui/progress-line";
import { suggestedDisplayName } from "@/lib/display-name";
import { createClient } from "@/lib/supabase/client";

type MyFeedback = {
  id: string;
  kind: "bug" | "feature" | "question" | "other";
  title: string;
  status: string;
  priority: string;
  reporter_note: string | null;
  created_at: string;
  credit_opt_in: boolean;
  credit_name: string | null;
};

function safeReportedPage(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "";
  }
  return value.slice(0, 500);
}

const kindLabels = {
  bug: "🐛 Something is broken",
  feature: "✨ I have an idea",
  question: "💬 I have a question",
  other: "📝 Something else",
} as const;

export function FeedbackScreen({ reportedPage = "" }: { reportedPage?: string }) {
  const pagePath = safeReportedPage(reportedPage);
  const [kind, setKind] = useState<keyof typeof kindLabels>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [creditOptIn, setCreditOptIn] = useState(false);
  const [creditName, setCreditName] = useState("");
  const [items, setItems] = useState<MyFeedback[]>([]);
  const [creditDrafts, setCreditDrafts] = useState<Record<string, { optIn: boolean; name: string }>>({});
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
    else {
      const nextItems = (data ?? []) as MyFeedback[];
      setItems(nextItems);
      setCreditDrafts(Object.fromEntries(nextItems.map((item) => [item.id, { optIn: item.credit_opt_in, name: item.credit_name ?? "" }])));
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
    void createClient().auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await createClient().from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const fromProfile = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
      setCreditName(fromProfile && fromProfile !== "Lunch friend" ? fromProfile.slice(0, 60) : suggestedDisplayName(user));
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (creditOptIn && (creditName.trim().length < 1 || creditName.trim().length > 60)) {
      setError("Add a name of 1 to 60 characters, or leave the credit box unchecked.");
      return;
    }
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
          pagePath: pagePath || window.location.pathname,
          build: appInfo.build,
          creditOptIn,
          creditName: creditOptIn ? creditName.trim() : undefined,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Feedback could not be sent.");
      setTitle("");
      setDetails("");
      setCreditOptIn(false);
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

  async function saveCredit(item: MyFeedback) {
    const draft = creditDrafts[item.id] ?? { optIn: item.credit_opt_in, name: item.credit_name ?? "" };
    if (draft.optIn && (draft.name.trim().length < 1 || draft.name.trim().length > 60)) {
      setError("Add a name of 1 to 60 characters, or leave the credit box unchecked.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const { error: creditError } = await createClient().rpc("update_my_lunch_loop_feedback_credit", {
      target_feedback: item.id,
      new_credit_opt_in: draft.optIn,
      new_credit_name: draft.optIn ? draft.name.trim() : null,
    });
    setBusy(false);
    if (creditError) {
      setError(creditError.message);
      return;
    }
    setMessage(draft.optIn ? "We’ll use that name if this note ships in the release notes." : "Public credit is off for this note.");
    await load();
  }

  const shownPage = pagePath || "/feedback";

  return (
    <AppFrame>
      <p className="text-sm font-medium text-accent-strong">
        Help shape Lunch Loop
      </p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Feedback</h1>
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
        <p className="mt-4 rounded-2xl bg-orange-50 px-3 py-2 text-xs leading-5 text-stone-600">
          This note includes page <span className="font-bold">{shownPage}</span> and build <span className="font-bold">{appInfo.build}</span>.
        </p>
        <label className="mt-5 flex items-start gap-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={creditOptIn}
            onChange={(event) => setCreditOptIn(event.target.checked)}
            className="mt-1 size-4 accent-orange-500"
          />
          <span>Credit me by name in release notes if this ships</span>
        </label>
        <label className="mt-3 block text-sm font-black">
          Name to show
          <input
            value={creditName}
            maxLength={60}
            onChange={(event) => setCreditName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300"
          />
        </label>
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Leave this unchecked unless you want a public thank-you, such as “Fixed X (reported by Sam — thanks!)”. You can turn it off later. Please avoid passwords, payment details, or other sensitive personal information.
        </p>
        <button disabled={busy} className="mt-5 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60">
          {busy ? "Sending…" : "Send feedback →"}
        </button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p>}
      <section id="my-feedback" className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">My feedback</h2>
        <p className="mt-1 text-sm text-muted">Only your own notes. Each one moves along as we work on it.</p>
        {loading ? <p className="mt-4 text-sm text-muted">Loading your notes…</p> : items.length ? (
          <div className="mt-3 space-y-2">
            {items.slice(0, 8).map((item) => {
              const step = feedbackStep(item.status);
              return (
                <article key={item.id} className="rounded-[var(--ll-radius-lg)] bg-surface px-5 py-4 shadow-[var(--ll-shadow-card)]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="min-w-0 text-[15px] font-semibold">{item.title}</strong>
                    <span className="text-xs text-subtle">{new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                  {step > 0 ? (
                    <ProgressLine className="mt-3" steps={[...feedbackSteps]} current={step} label={`Status of ${item.title}`} />
                  ) : (
                    <p className="mt-2 text-sm text-muted">{feedbackStatusLabel(item.status)}</p>
                  )}
                  {item.reporter_note && (
                    <div className="mt-3 rounded-[var(--ll-radius-md)] bg-stone-50 px-3 py-2 text-sm leading-6">
                      <p className="text-xs font-semibold text-accent-strong">What changed</p>
                      <p className="mt-1 whitespace-pre-wrap">{item.reporter_note}</p>
                    </div>
                  )}
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted">Release-note credit{item.credit_opt_in ? " · on" : ""}</summary>
                    <div className="mt-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={creditDrafts[item.id]?.optIn ?? false}
                          onChange={(event) => setCreditDrafts((current) => ({ ...current, [item.id]: { optIn: event.target.checked, name: current[item.id]?.name ?? item.credit_name ?? "" } }))}
                          className="mt-1 size-4 accent-orange-500"
                        />
                        <span>Credit me by name in release notes if this ships</span>
                      </label>
                      <input
                        value={creditDrafts[item.id]?.name ?? ""}
                        maxLength={60}
                        onChange={(event) => setCreditDrafts((current) => ({ ...current, [item.id]: { optIn: current[item.id]?.optIn ?? false, name: event.target.value } }))}
                        className="mt-2 w-full rounded-[var(--ll-radius-md)] border border-stone-200 bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300"
                        aria-label={`Credit name for ${item.title}`}
                      />
                      <button type="button" disabled={busy} onClick={() => void saveCredit(item)} className="mt-2 text-sm font-medium text-accent-strong disabled:opacity-60">
                        {creditDrafts[item.id]?.optIn ? "Save credit" : "Withdraw credit"}
                      </button>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : <p className="mt-4 text-sm text-muted">No feedback sent yet. The first good idea can be yours.</p>}
      </section>
    </AppFrame>
  );
}
