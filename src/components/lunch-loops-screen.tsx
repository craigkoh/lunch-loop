"use client";

import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState, OccasionLabel } from "./app-frame";
import { buttonClass, ButtonLink } from "./ui/button";
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
        <p className="text-sm font-medium text-accent-strong">Your Lunch Loops</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">{currentLoop ? "My Lunch Loops" : "Start your first Lunch Loop"}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">Each Lunch Loop keeps its own people, home area, restaurant database, picks, and stats.</p>
      </div>
      {!loading && currentLoop && (
        <button disabled={busy || ownedActiveCount >= ownedLoopLimit} onClick={() => void startAnotherLoop()} className={buttonClass("secondary")}>
          {ownedActiveCount >= ownedLoopLimit ? `${ownedLoopLimit} owned loops active` : "＋ New Lunch Loop"}
        </button>
      )}
    </div>
    {loading ? <p className="mt-6 text-[15px] text-muted">Loading your Lunch Loops…</p> : currentLoop ? <>
      <section className="mt-6 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">Current Lunch Loop</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-[22px] font-bold tracking-tight">{currentLoop.group_name}<LoopTags loop={currentLoop} /></h2>
            <p className="mt-1 text-[15px] text-muted">Owned by {currentLoop.owner_display_name ?? "your crew"} · {currentLoop.member_count}/6 people</p>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted">{currentLoop.loop_type === "occasion" ? "A special-night crew. There is no automatic handoff: whoever starts the next outing makes that night’s picks." : "A standing crew. Once a meal is closed, the next person in the saved order gets the next round of picks."}</p>
        <dl className="mt-4 divide-y divide-line rounded-[var(--ll-radius-md)] border border-line"><Info label="Home area" value={currentLoop.home_label ? currentLoop.home_label.split("·")[0] : "Needs setup"} /><Info label="Search radius" value={currentLoop.search_radius_miles ? currentLoop.search_radius_miles + " miles" : "Needs setup"} /><Info label="Crew size" value={currentLoop.member_count + " of 6 people"} /></dl>
        <div className="mt-5 flex flex-wrap gap-2"><ButtonLink href="/">Open this loop</ButtonLink><ButtonLink href="/settings" variant="secondary">{currentLoop.role === "owner" ? "Manage this loop" : "Loop settings"}</ButtonLink></div>
      </section>
      {loops.filter((loop) => loop.status === "active").length > 1 && <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Switch Lunch Loops</h2>
        <p className="mt-1 text-[15px] leading-6 text-muted">Each crew has a separate restaurant list, lunch history, and settings. Switching never combines them.</p>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--ll-radius-lg)] bg-surface shadow-[var(--ll-shadow-card)]">
          {loops.filter((loop) => loop.status === "active").map((loop) => <LoopSwitcherRow key={loop.group_id} loop={loop} isCurrent={loop.group_id === currentLoop.group_id} busy={busy} onSwitch={switchLoop} />)}
        </ul>
      </section>}
      {loops.some((loop) => loop.status === "archived") && <section className="mt-8"><h2 className="text-lg font-semibold tracking-tight">Archived Lunch Loops</h2><p className="mt-1 text-[15px] leading-6 text-muted">Archived loops are out of your everyday switcher. Owners can restore or permanently remove them here.</p><ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--ll-radius-lg)] bg-surface shadow-[var(--ll-shadow-card)]">{loops.filter((loop) => loop.status === "archived").map((loop) => <ArchivedLoopCard key={loop.group_id} loop={loop} busy={busy} onRestore={restore} onDelete={permanentlyDelete} />)}</ul></section>}
    </> : <div className="mt-6"><EmptyState title="Make your first Lunch Loop">Create a Lunch Loop for your own crew, then invite up to five people. Already have an owner’s crew invitation? Use its short code to join that crew instead.<div className="mt-5 flex flex-wrap justify-center gap-3"><ButtonLink href="/start">Create a Lunch Loop</ButtonLink><ButtonLink href="/join" variant="secondary">Use an invitation code</ButtonLink></div></EmptyState></div>}
    {message && <p role="status" className="mt-4 rounded-[var(--ll-radius-md)] bg-surface p-4 text-[15px] text-ink shadow-[var(--ll-shadow-card)]">{message}</p>}
    {error && <p role="alert" className="mt-4 rounded-[var(--ll-radius-md)] bg-danger-soft p-4 text-[15px] text-danger">{error}</p>}
  </AppFrame>;
}

/** Occasion gets a small label; Standing (the default) stays unlabeled. Owner is a quiet tag. */
function LoopTags({ loop }: { loop: LunchLoopSummary }) {
  return <>
    {loop.loop_type === "occasion" && <OccasionLabel />}
    {loop.role === "owner" && <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">Owner</span>}
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 px-4 py-3 text-[15px]"><dt className="text-muted">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

function LoopSwitcherRow({ loop, isCurrent, busy, onSwitch }: { loop: LunchLoopSummary; isCurrent: boolean; busy: boolean; onSwitch: (loop: LunchLoopSummary) => Promise<void> }) {
  return <li><button type="button" disabled={busy} onClick={() => isCurrent ? window.location.assign("/") : void onSwitch(loop)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60">
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">{loop.group_name}<LoopTags loop={loop} /></span>
      <span className="mt-0.5 block text-sm text-muted">{loop.home_label ? loop.home_label.split("·")[0] : "Home area needs setup"} · {loop.member_count}/6 people</span>
    </span>
    {isCurrent ? <span className="shrink-0 text-sm font-medium text-accent-strong">Current ✓</span> : <span className="shrink-0 text-sm font-medium text-accent-strong">Switch ›</span>}
  </button></li>;
}

function ArchivedLoopCard({ loop, busy, onRestore, onDelete }: { loop: LunchLoopSummary; busy: boolean; onRestore: (loop: LunchLoopSummary) => Promise<void>; onDelete: (loop: LunchLoopSummary) => Promise<void> }) {
  const scheduled = loop.status === "archived" ? new Date(loop.delete_scheduled_for ?? "") : null;
  const canDelete = Boolean(scheduled && !Number.isNaN(scheduled.valueOf()) && scheduled <= new Date());
  return <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">{loop.group_name}<LoopTags loop={loop} /></p>
      <p className="mt-0.5 text-sm text-muted">
        {loop.owner_display_name ?? "Lunch Loop owner"} · archived
        {scheduled && <> · deletion available {dateLabel(loop.delete_scheduled_for)}</>}
      </p>
    </div>
    {loop.role === "owner" && <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void onRestore(loop)} className={buttonClass("secondary")}>Restore</button>{canDelete && <button disabled={busy} onClick={() => void onDelete(loop)} className={buttonClass("danger")}>Delete</button>}</div>}
  </li>;
}
