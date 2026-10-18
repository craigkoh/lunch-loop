"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { createClient } from "@/lib/supabase/client";
import { getMyLunchLoops, type LunchLoopSummary } from "@/lib/supabase/group";

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : null;
}

export function LunchLoopsScreen() {
  const [loops, setLoops] = useState<LunchLoopSummary[]>([]);
  const [accountEmail, setAccountEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [nextLoops, { data: { user } }] = await Promise.all([getMyLunchLoops(), createClient().auth.getUser()]);
      setLoops(nextLoops);
      setAccountEmail(user?.email ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Lunch Loops could not be loaded.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const currentLoop = useMemo(
    () => loops.find((loop) => loop.active) ?? loops.find((loop) => loop.status === "active") ?? null,
    [loops],
  );
  const ownedActiveCount = loops.filter((loop) => loop.role === "owner" && loop.status === "active").length;
  const ownedLoopLimit = currentLoop?.owned_loop_limit ?? 4;

  async function switchLoop(loop: LunchLoopSummary) {
    setBusy(true); setError("");
    try {
      const { error: switchError } = await createClient().rpc("set_active_lunch_loop", { target_group: loop.group_id });
      if (switchError) throw switchError;
      window.location.assign("/");
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Lunch Loop could not be switched.");
      setBusy(false);
    }
  }
  async function restore(loop: LunchLoopSummary) {
    setBusy(true); setError("");
    try {
      const { error: restoreError } = await createClient().rpc("restore_archived_lunch_loop", { target_group: loop.group_id });
      if (restoreError) throw restoreError;
      window.location.assign("/");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Lunch Loop could not be restored.");
      setBusy(false);
    }
  }
  async function permanentlyDelete(loop: LunchLoopSummary) {
    if (!window.confirm(`Permanently delete ${loop.group_name}? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const { error: deleteError } = await createClient().rpc("permanently_delete_lunch_loop", { target_group: loop.group_id });
      if (deleteError) throw deleteError;
      setMessage("Lunch Loop permanently deleted.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Lunch Loop could not be deleted.");
    } finally {
      setBusy(false);
    }
  }
  async function startAnotherLoop() {
    if (!currentLoop || !accountEmail) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations/new-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: currentLoop.group_id, email: accountEmail }),
      });
      const result = (await response.json()) as { inviteUrl?: string; error?: string };
      if (!response.ok || !result.inviteUrl) throw new Error(result.error ?? "A new-loop invitation could not be created.");
      window.location.assign(result.inviteUrl);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "A new-loop invitation could not be created.");
      setBusy(false);
    }
  }

  return <AppFrame>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Your Lunch Loops</p>
        {currentLoop ? <Link href="/" className="mt-1 inline-block text-3xl font-black text-stone-900 underline decoration-orange-300 underline-offset-4">{currentLoop.group_name}</Link> : <h1 className="mt-1 text-3xl font-black">Start your first Lunch Loop</h1>}
        <p className="mt-2 max-w-2xl text-stone-600">Each Lunch Loop keeps its own people, home area, restaurant database, picks, and stats.</p>
      </div>
      {!loading && currentLoop && (
        <button disabled={busy || ownedActiveCount >= ownedLoopLimit} onClick={() => void startAnotherLoop()} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
          {ownedActiveCount >= ownedLoopLimit ? `${ownedLoopLimit} owned loops active` : "＋ Create a Lunch Loop"}
        </button>
      )}
    </div>
    {loading ? <p className="mt-6 text-sm font-semibold text-stone-500">Loading your Lunch Loops…</p> : currentLoop ? <>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Switch Lunch Loops</p>
        <h2 className="mt-1 text-xl font-black">{loops.length === 1 ? "This is your Lunch Loop" : "Choose the crew you’re using now"}</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">{loops.length === 1 ? "When you create or join another Lunch Loop, it will appear here." : "Each crew has a separate restaurant list, lunch history, and settings. Switching never combines them."}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {loops.filter((loop) => loop.status === "active").map((loop) => <LoopSwitcherCard key={loop.group_id} loop={loop} isCurrent={loop.group_id === currentLoop.group_id} busy={busy} onSwitch={switchLoop} />)}
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-5 text-white shadow-xl shadow-orange-200">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Current Lunch Loop</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-black">{currentLoop.group_name}</h2><p className="mt-1 text-sm text-orange-50">Owned by {currentLoop.owner_display_name ?? "your crew"} · {currentLoop.member_count}/6 people</p></div><div className="flex gap-2"><span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black text-white">{currentLoop.loop_type === "occasion" ? "✨ Occasion" : "🔁 Standing"}</span><span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black text-white">{currentLoop.role === "owner" ? "👑 Owner" : "👤 Member"}</span></div></div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-orange-50">{currentLoop.loop_type === "occasion" ? "A special-night crew. There is no automatic handoff: whoever starts the next outing makes that night’s picks." : "A recurring crew. Once a meal is closed, the next person in the saved order gets the next round of picks."}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><Info label="Home area" value={currentLoop.home_label ? currentLoop.home_label.split("·")[0] : "Needs setup"} /><Info label="Search radius" value={currentLoop.search_radius_miles ? currentLoop.search_radius_miles + " miles" : "Needs setup"} /><Info label="Crew size" value={currentLoop.member_count + " of 6 people"} /></div>
        <div className="mt-5 flex flex-wrap gap-2"><Link href="/database" className="rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-800">Open lunch database</Link><Link href="/settings" className="rounded-xl border border-white/50 bg-white/10 px-4 py-3 text-sm font-black text-white">{currentLoop.role === "owner" ? "Manage this loop" : "View loop settings"}</Link></div>
      </section>
      {loops.some((loop) => loop.status === "archived") && <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Archived Lunch Loops</h2><p className="mt-1 text-sm text-stone-600">Archived loops are out of your everyday switcher. Owners can restore or permanently remove them here.</p><div className="mt-4 space-y-2">{loops.filter((loop) => loop.status === "archived").map((loop) => <ArchivedLoopCard key={loop.group_id} loop={loop} busy={busy} onRestore={restore} onDelete={permanentlyDelete} />)}</div></section>}
    </> : <div className="mt-6"><EmptyState title="Make your first Lunch Loop">Create a Lunch Loop for your own crew, then invite up to five people. Already have an owner’s crew invitation? Use its short code to join that crew instead.<div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/start" className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white">Create a Lunch Loop</Link><Link href="/join" className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-black text-orange-800">Use an invitation code</Link></div></EmptyState></div>}
    {message && <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
  </AppFrame>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/15 p-3"><p className="text-xs font-bold text-orange-100">{label.toUpperCase()}</p><p className="mt-1 font-black text-white">{value}</p></div>;
}

function LoopSwitcherCard({ loop, isCurrent, busy, onSwitch }: { loop: LunchLoopSummary; isCurrent: boolean; busy: boolean; onSwitch: (loop: LunchLoopSummary) => Promise<void> }) {
  return <button type="button" disabled={busy} onClick={() => isCurrent ? window.location.assign("/") : void onSwitch(loop)} className={"w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-wait disabled:opacity-60 " + (isCurrent ? "border-orange-300 bg-orange-50" : "border-stone-100 bg-stone-50")}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-black">{loop.group_name}</h3>
          {loop.loop_type === "occasion" ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-black text-violet-900">✨ Occasion</span> : <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-black text-orange-800">🔁 Standing</span>}
          {loop.role === "owner" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">👑 Owner</span>}
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-600">
          {loop.home_label ? loop.home_label.split("·")[0] : "home area needs setup"} · {loop.member_count}/6 people
        </p>
      </div>
      {isCurrent ? <span className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-black text-white">Open this loop →</span> : <span className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-black text-white">Use this loop →</span>}
    </div>
  </button>;
}

function ArchivedLoopCard({ loop, busy, onRestore, onDelete }: { loop: LunchLoopSummary; busy: boolean; onRestore: (loop: LunchLoopSummary) => Promise<void>; onDelete: (loop: LunchLoopSummary) => Promise<void> }) {
  const scheduled = loop.status === "archived" ? new Date(loop.delete_scheduled_for ?? "") : null;
  const canDelete = Boolean(scheduled && !Number.isNaN(scheduled.valueOf()) && scheduled <= new Date());
  return <article className="rounded-2xl bg-stone-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-black">{loop.group_name}</h3>
          {loop.role === "owner" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">👑 Owner</span>}
        </div>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          {loop.loop_type === "occasion" ? "✨ Occasion" : "🔁 Standing"} · {loop.owner_display_name ?? "Lunch Loop owner"} · archived
          {scheduled && <> · deletion available {dateLabel(loop.delete_scheduled_for)}</>}
        </p>
      </div>
      {loop.role === "owner" && <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void onRestore(loop)} className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-black text-white disabled:opacity-60">Restore</button>{canDelete && <button disabled={busy} onClick={() => void onDelete(loop)} className="rounded-xl bg-rose-700 px-3 py-2 text-sm font-black text-white disabled:opacity-60">Delete</button>}</div>}
    </div>
  </article>;
}
