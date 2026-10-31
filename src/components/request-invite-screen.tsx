"use client";

import Link from "next/link";
import { AuthShell, authCardClass } from "./ui/auth-shell";
import { useEffect, useState } from "react";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { FeedbackBugLink } from "./feedback-bug-link";

type RequestStatus = "new" | "reviewed" | "invited" | "declined" | "spam";

const statusCopy: Record<
  RequestStatus,
  { title: string; body: string; tone: string }
> = {
  new: {
    title: "Your request is in the loop",
    body: "Thanks! We’ll review this invite-only request before creating or connecting a Lunch Loop.",
    tone: "bg-emerald-50 text-emerald-950 ring-emerald-200",
  },
  reviewed: {
    title: "Your request is being reviewed",
    body: "Thanks for your patience. We’ll use the account below if we can invite you.",
    tone: "bg-amber-50 text-amber-950 ring-amber-200",
  },
  invited: {
    title: "You’re on the invite list",
    body: "Check the email attached to this account for your next step.",
    tone: "bg-orange-50 text-orange-950 ring-orange-200",
  },
  declined: {
    title: "This request is not active",
    body: "Early access is limited. You may request another review later.",
    tone: "bg-stone-100 text-stone-800 ring-stone-200",
  },
  spam: {
    title: "This request is not active",
    body: "Early access is limited.",
    tone: "bg-stone-100 text-stone-800 ring-stone-200",
  },
};

export function RequestInviteScreen() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [requestStatus, setRequestStatus] = useState<RequestStatus | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!hasSupabaseEnv()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      setEmail(user.email ?? "");
      const { data, error: requestError } = await supabase.rpc(
        "get_my_lunch_loop_invite_request",
      );
      if (requestError) throw requestError;
      const current = data?.[0] as
        { status: RequestStatus; requested_at: string } | undefined;
      setRequestStatus(current?.status ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Your invite-request status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: requestError } = await createClient().rpc(
        "request_lunch_loop_invite",
        { request_note: note },
      );
      if (requestError) throw requestError;
      setNote("");
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Your invite request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell wide>
      <section className={authCardClass}>
        <p className="text-sm font-medium text-accent-strong">
          Invite-only early access
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">
          Request a Lunch Loop invite
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-6 text-muted">
          We ask you to sign in first so this request is attached to
          a real Lunch Loop account—not an open email form that gets buried in
          spam. This does not create a group or add you to one.
        </p>

        {loading ? (
          <p className="mt-7 text-sm font-semibold text-stone-500">
            Checking your request…
          </p>
        ) : !hasSupabaseEnv() ? (
          <p className="mt-7 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            Lunch Loop is not connected yet. Please try again later.
          </p>
        ) : !signedIn ? (
          <div className="mt-7 rounded-3xl bg-orange-50 p-5">
            <h2 className="text-lg font-black">First, identify your crew</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Sign in with Google or a one-time email link. We
              use that account to keep requests manageable and to send any invitation to
              the right person.
            </p>
            <Link
              href="/sign-in?next=/request-invite"
              className="mt-4 inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-sm"
            >
              Sign in to continue →
            </Link>
          </div>
        ) : requestStatus ? (
          <div
            className={[
              "mt-7 rounded-3xl p-5 ring-1",
              statusCopy[requestStatus].tone,
            ].join(" ")}
          >
            <p className="text-xs font-black uppercase tracking-[0.16em] opacity-75">
              {email || "Your account"}
            </p>
            <h2 className="mt-2 text-xl font-black">
              {statusCopy[requestStatus].title}
            </h2>
            <p className="mt-2 text-sm leading-6">
              {statusCopy[requestStatus].body}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7">
            <div className="rounded-3xl bg-orange-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">
                Requesting as
              </p>
              <p className="mt-1 break-all text-sm font-black text-stone-800">
                {email || "Your signed-in account"}
              </p>
            </div>
            <label className="mt-5 block text-sm font-black">
              A quick note{" "}
              <span className="font-normal text-stone-500">(optional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="For example: I have a group of four coworkers who would love to try Lunch Loop."
                className="mt-2 block w-full resize-y rounded-2xl border border-orange-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
              <span className="mt-1 block text-right text-xs font-medium text-stone-400">
                {note.length}/500
              </span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Saving your request…" : "Request invite"}
            </button>
          </form>
        )}

        {signedIn && <div className="mt-5"><FeedbackBugLink page="/request-invite" /></div>}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-800"
          >
            {error}
          </p>
        )}
      </section>
    </AuthShell>
  );
}
