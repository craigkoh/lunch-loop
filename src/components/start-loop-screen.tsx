"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppFrame } from "./app-frame";
import { suggestedDisplayName } from "@/lib/display-name";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { FeedbackBugLink } from "./feedback-bug-link";
import { getMyLunchLoops } from "@/lib/supabase/group";
import { LoopAreaPicker, type LoopHomeArea } from "./loop-area-picker";

export function StartLoopScreen() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [signedIn, setSignedIn] = useState(false);
  const [hasExistingLoop, setHasExistingLoop] = useState(false);
  const [ownedLoopLimit, setOwnedLoopLimit] = useState(4);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [loopType, setLoopType] = useState<"standing" | "occasion">("standing");
  const [homeArea, setHomeArea] = useState<LoopHomeArea>({ label: "", lat: null, lng: null, radiusMiles: 25, timeZone: "America/Chicago" });

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    async function loadAccount() {
      const { data: { user } } = await createClient().auth.getUser();
      setSignedIn(Boolean(user));
      setDisplayName(suggestedDisplayName(user));
      if (user) {
        try {
          const loops = await getMyLunchLoops();
          setHasExistingLoop(loops.some((loop) => loop.active || loop.status === "active"));
          setOwnedLoopLimit(loops[0]?.owned_loop_limit ?? 4);
        } catch {
          setHasExistingLoop(false);
        }
      }
      setLoading(false);
    }
    void loadAccount();
  }, []);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/create-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          groupName,
          displayName,
          homeLabel: homeArea.label,
          homeLat: homeArea.lat,
          homeLng: homeArea.lng,
          radiusMiles: homeArea.radiusMiles,
          timeZone: homeArea.timeZone,
          loopType,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your Lunch Loop could not be started.");
      setStarted(true);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Your Lunch Loop could not be started.");
    } finally {
      setBusy(false);
    }
  }

  const currentPath = `/start${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const isFirstLoop = !token;
  const setupCard = (
      <section className="w-full rounded-3xl bg-white p-6 shadow-xl shadow-orange-100 sm:p-8">
        <div className="text-4xl">🎉</div>
        <p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">New Lunch Loop</p>
        <h1 className="mt-1 text-3xl font-black">Build your Lunch Loop</h1>
        <p className="mt-2 max-w-2xl text-stone-600">Choose its rhythm and home area, then invite up to five friends to share the restaurant list, picks, and vetoes.</p>
        {loading ? <p className="mt-6 text-sm font-semibold text-stone-500">Checking your secure sign-in…</p> : !signedIn ? (
          <Link href={`/sign-in?next=${encodeURIComponent(currentPath)}`} className="mt-6 inline-flex rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white">Sign in to continue →</Link>
        ) : started ? (
          <div className="mt-6 rounded-3xl bg-orange-50 p-5">
            <h2 className="text-xl font-black text-orange-950">Your loop is ready! 🍽️</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-stone-700">
              <li><strong>Invite your crew.</strong> Open Settings and send one-time invitations to up to five friends.</li>
              <li><strong>Build your database.</strong> Add a few favorite spots while ideas are fresh.</li>
              <li><strong>Start the first {loopType === "occasion" ? "occasion" : "loop"}.</strong> Make the picks, set the time, and let the vetoes do their work.</li>
            </ol>
            {loopType === "occasion" && <p className="mt-4 rounded-2xl bg-white/70 p-3 text-sm leading-6 text-stone-700">✨ We also brought in a clean copy of places you added in your other Lunch Loops. Their past visits, vetoes, and never-again notes stay private to those original loops.</p>}
            <Link href="/settings" className="mt-5 inline-flex rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white">Set up my crew →</Link>
          </div>
        ) : (
          <form onSubmit={start} className="mt-6 space-y-4">
            <label className="block text-sm font-black">Your name
              <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} placeholder="What your crew calls you" className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300" />
            </label>
            <label className="block text-sm font-black">Lunch Loop name
              <input required value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={80} placeholder="Example: Downtown Lunch Crew" className="mt-2 w-full rounded-xl border border-orange-200 px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300" />
            </label>
            <fieldset>
              <legend className="text-sm font-black">What kind of Lunch Loop is this?</legend>
              <p className="mt-1 text-sm text-stone-600">Both types have the same private places, picks, vetoes, history, and stats.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={"cursor-pointer rounded-2xl border p-4 transition " + (loopType === "standing" ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200" : "border-orange-100 bg-white")}>
                  <input className="sr-only" type="radio" name="loop-type" value="standing" checked={loopType === "standing"} onChange={() => setLoopType("standing")} />
                  <span className="block text-lg" aria-hidden="true">🔁</span>
                  <span className="mt-2 block font-black">Standing</span>
                  <span className="mt-1 block text-xs leading-5 text-stone-600">Your recurring crew. Completed meals hand the next picks to the next person in order.</span>
                </label>
                <label className={"cursor-pointer rounded-2xl border p-4 transition " + (loopType === "occasion" ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200" : "border-orange-100 bg-white")}>
                  <input className="sr-only" type="radio" name="loop-type" value="occasion" checked={loopType === "occasion"} onChange={() => setLoopType("occasion")} />
                  <span className="block text-lg" aria-hidden="true">✨</span>
                  <span className="mt-2 block font-black">Occasion</span>
                  <span className="mt-1 block text-xs leading-5 text-stone-600">A special night out. There is no automatic next turn; whoever starts the next occasion makes that night’s picks.</span>
                </label>
              </div>
            </fieldset>
            <div>
              <p className="text-sm font-black">Where does your crew eat?</p>
              <p className="mt-1 text-sm text-stone-600">Set the center and radius for the private restaurant database you’re about to create.</p>
              <div className="mt-3"><LoopAreaPicker value={homeArea} onChange={setHomeArea} disabled={busy} /></div>
            </div>
            <button disabled={busy || !homeArea.label || homeArea.lat === null || homeArea.lng === null || !homeArea.timeZone} className="w-full rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? "Creating your Lunch Loop…" : "Create Lunch Loop →"}</button>
          </form>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
      </section>
  );
  if (signedIn && hasExistingLoop && isFirstLoop) {
    return <AppFrame>
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-7 shadow-xl shadow-orange-100">
        <p className="text-sm font-bold uppercase tracking-widest text-orange-600">You’re already set up</p>
        <h1 className="mt-1 text-3xl font-black">You already have a Lunch Loop</h1>
        <p className="mt-3 leading-6 text-stone-600">Use My Lunch Loops to switch crews or create another loop, up to your current {ownedLoopLimit}-loop owner limit.</p>
        <Link href="/loops" className="mt-5 inline-flex rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white">Go to My Lunch Loops →</Link>
      </div>
    </AppFrame>;
  }
  if (signedIn && hasExistingLoop) {
    return <AppFrame>
      <div className="mx-auto max-w-4xl">{setupCard}</div>
    </AppFrame>;
  }
  return <main className="grid min-h-dvh place-items-center bg-[#fffaf3] p-4">
    <div className="w-full max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex text-sm font-black text-orange-700 underline">← Back to Lunch Loop</Link>
        {signedIn && <FeedbackBugLink page={currentPath} />}
      </div>
      {setupCard}
    </div>
  </main>;
}
