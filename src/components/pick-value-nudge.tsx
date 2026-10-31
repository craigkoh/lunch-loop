"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  decidePickNudge,
  milesBetween,
  oneLiners,
  readPickNudge,
  receiptLines,
  tipAskLabel,
  tipFreeNote,
  type NudgeStyle,
  type PickNudgeFacts,
  writePickNudge,
} from "@/lib/donation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

/** What the home screen already knows about the finished pick. */
export type PickNudgeBase = Omit<PickNudgeFacts, "decideMinutes" | "distanceMiles" | "daysSinceLastVisit"> & {
  groupId: string;
  restaurantId: string | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  scheduledFor: string;
};

const dayMs = 86_400_000;

/** Reads the few extra per-lunch facts a receipt needs. Only runs when a receipt is shown. */
async function loadReceiptFacts(base: PickNudgeBase, sessionId: string): Promise<PickNudgeFacts> {
  const supabase = createClient();
  const [sessionResult, groupResult, previousResult] = await Promise.all([
    supabase.from("lunch_sessions").select("started_at, winner_recorded_at").eq("id", sessionId).maybeSingle(),
    supabase.from("groups").select("home_lat, home_lng").eq("id", base.groupId).maybeSingle(),
    base.restaurantId
      ? supabase
          .from("lunch_sessions")
          .select("scheduled_for")
          .eq("group_id", base.groupId)
          .eq("final_restaurant_id", base.restaurantId)
          .eq("status", "completed")
          .neq("id", sessionId)
          .lt("scheduled_for", base.scheduledFor)
          .order("scheduled_for", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const session = sessionResult.data as { started_at: string | null; winner_recorded_at: string | null } | null;
  const group = groupResult.data as { home_lat: number | null; home_lng: number | null } | null;
  const previous = previousResult.data as { scheduled_for: string } | null;
  const decideMinutes =
    session?.started_at && session.winner_recorded_at
      ? Math.max(0, (new Date(session.winner_recorded_at).getTime() - new Date(session.started_at).getTime()) / 60_000)
      : null;
  const distanceMiles =
    group?.home_lat != null && group.home_lng != null && base.restaurantLat != null && base.restaurantLng != null
      ? milesBetween({ lat: group.home_lat, lng: group.home_lng }, { lat: base.restaurantLat, lng: base.restaurantLng })
      : null;
  const daysSinceLastVisit = previous
    ? Math.max(0, Math.round((new Date(base.scheduledFor).getTime() - new Date(previous.scheduled_for).getTime()) / dayMs))
    : null;
  return { ...base, decideMinutes, distanceMiles, daysSinceLastVisit };
}

export function PickValueNudge({
  userId,
  sessionId,
  base,
}: {
  userId: string;
  sessionId: string;
  base: PickNudgeBase;
}) {
  const [choice, setChoice] = useState<{ style: NudgeStyle; variant: number; facts: PickNudgeFacts } | null>(null);
  const baseKey = JSON.stringify(base);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    const facts = JSON.parse(baseKey) as PickNudgeBase;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_donations_enabled");
        if (cancelled || error || data !== true) return;
        const decision = decidePickNudge(readPickNudge(userId), sessionId);
        if (decision.record) writePickNudge(userId, decision.record);
        if (!decision.visible) return;
        const full =
          decision.style === "receipt"
            ? await loadReceiptFacts(facts, sessionId).catch(() => ({
                ...facts,
                decideMinutes: null,
                distanceMiles: null,
                daysSinceLastVisit: null,
              }))
            : { ...facts, decideMinutes: null, distanceMiles: null, daysSinceLastVisit: null };
        if (!cancelled) setChoice({ style: decision.style, variant: decision.variant, facts: full });
      } catch {
        if (!cancelled) setChoice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, userId, baseKey]);

  if (!choice) return null;

  function dismiss() {
    const saved = readPickNudge(userId);
    writePickNudge(userId, {
      sessionId,
      dismissed: true,
      style: saved?.style ?? choice?.style ?? null,
      variant: saved?.variant ?? choice?.variant ?? 0,
      lastShown: choice?.style ?? saved?.lastShown ?? null,
    });
    setChoice(null);
  }

  return <PickNudgeView style={choice.style} variant={choice.variant} facts={choice.facts} onDismiss={dismiss} />;
}

export function PickNudgeView({
  style,
  variant,
  facts,
  onDismiss,
}: {
  style: NudgeStyle;
  variant: number;
  facts: PickNudgeFacts;
  onDismiss: () => void;
}) {
  if (style === "receipt") return <LunchReceipt facts={facts} onDismiss={onDismiss} />;
  if (style === "jar") return <TipJarNote onDismiss={onDismiss} />;
  const line = oneLiners[variant % oneLiners.length];
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-white px-3 py-2 text-sm leading-5 text-stone-800 shadow-sm">
      <p className="min-w-0 flex-1">
        {line.before}
        <Link href="/support" className="font-black text-orange-800 underline decoration-orange-400 underline-offset-2">
          {line.link}
        </Link>
        {line.after}
      </p>
      <DismissButton onDismiss={onDismiss} />
    </div>
  );
}

function LunchReceipt({
  facts,
  onDismiss,
}: {
  facts: PickNudgeFacts;
  onDismiss: () => void;
}) {
  const lines = receiptLines(facts);
  return (
    <section className="lunch-receipt-sheet w-full" aria-labelledby="lunch-receipt-ask">
      <div className="lunch-receipt px-3 pb-2 pt-3 text-center">
        <h2 id="lunch-receipt-ask" className="text-xl font-black leading-7" style={{ color: "var(--receipt-accent)" }}>
          Tip the loop?
        </h2>
        <p className="mt-1 text-xs leading-5 [overflow-wrap:anywhere]" style={{ color: "var(--receipt-muted)" }}>
          {facts.loopName} · {facts.pickedOn}
        </p>
        <div className="my-2 border-t border-dashed" style={{ borderColor: "var(--receipt-rule)" }} />
        <p className="text-[11px] font-bold tracking-[0.16em]" style={{ color: "var(--receipt-ink)" }}>
          TODAY&apos;S WINNER
        </p>
        <p className="mt-1 text-lg font-black leading-6 [overflow-wrap:anywhere]" style={{ color: "var(--receipt-accent)" }}>
          {facts.restaurantName}
        </p>
        <div className="my-2 border-t border-dashed" style={{ borderColor: "var(--receipt-rule)" }} />
        <ul className="space-y-1 text-left text-[13px] leading-5">
          {lines.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">{line.label}</span>
              <span className="min-w-0 text-right font-bold tabular-nums [overflow-wrap:anywhere]" style={{ color: "var(--receipt-ink)" }}>
                {line.value}
              </span>
            </li>
          ))}
        </ul>
        <div className="my-2 border-t border-dashed" style={{ borderColor: "var(--receipt-rule)" }} />
        <p className="text-sm font-bold leading-5" style={{ color: "var(--receipt-ink)" }}>
          {tipFreeNote}
        </p>
        <Link
          href="/support"
          className="lunch-receipt-button mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-black"
        >
          {tipAskLabel}
        </Link>
        <DismissButton onDismiss={onDismiss} tone="receipt" />
      </div>
      <div className="lunch-receipt-zigzag" aria-hidden="true" />
    </section>
  );
}

function TipJarNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2 text-sm text-stone-800 shadow-sm">
      <TipJarIcon />
      <p className="min-w-0 flex-1">
        <Link href="/support" className="font-black text-orange-800 underline decoration-orange-400 underline-offset-2">
          Tip the loop?
        </Link>
        <span className="mt-0.5 block text-xs text-stone-600">{tipFreeNote}</span>
      </p>
      <DismissButton onDismiss={onDismiss} />
    </div>
  );
}

function TipJarIcon() {
  return (
    <span className="relative block h-11 w-9 shrink-0" aria-hidden="true">
      <span className="lunch-coin absolute left-1/2 top-0 size-2.5 -translate-x-1/2 rounded-full bg-amber-400 ring-1 ring-amber-600" />
      <svg viewBox="0 0 36 44" className="absolute inset-0 h-full w-full">
        <rect x="8" y="10" width="20" height="4" rx="1.2" fill="#c2410c" />
        <path
          d="M11 14h14v2.2c3.2 1.2 5 3.6 5 7.2 0 6.4-3.2 14.6-12 14.6S6 29.8 6 23.4c0-3.6 1.8-6 5-7.2V14z"
          fill="#fff7ed"
          stroke="#9a3412"
          strokeWidth="1.4"
        />
        <path d="M10 24c.6 4.5 3 8 8 8" fill="none" stroke="#fdba74" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function DismissButton({ onDismiss, tone = "chip" }: { onDismiss: () => void; tone?: "chip" | "receipt" }) {
  const className =
    tone === "receipt"
      ? "mt-1 inline-flex min-h-11 items-center justify-center px-2 text-xs font-bold underline"
      : "inline-flex min-h-11 shrink-0 items-center px-1 text-xs font-bold text-stone-600 underline";
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={className}
      style={tone === "receipt" ? { color: "var(--receipt-muted)" } : undefined}
    >
      Not now
    </button>
  );
}
