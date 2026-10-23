"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  decidePickNudge,
  oneLiners,
  readPickNudge,
  receiptLines,
  type NudgeStyle,
  type PickNudgeFacts,
  writePickNudge,
} from "@/lib/donation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

export function PickValueNudge({
  userId,
  sessionId,
  facts,
}: {
  userId: string;
  sessionId: string;
  facts: PickNudgeFacts;
}) {
  const [choice, setChoice] = useState<{ style: NudgeStyle; variant: number } | null>(null);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_donations_enabled");
        if (cancelled || error || data !== true) return;
        const saved = readPickNudge(userId);
        const decision = decidePickNudge(saved, userId, sessionId);
        if (!decision.visible) return;
        if (!saved || saved.sessionId !== sessionId || saved.style !== decision.style) {
          writePickNudge(userId, {
            sessionId,
            dismissed: false,
            style: decision.style,
            variant: decision.variant,
          });
        }
        if (!cancelled) setChoice({ style: decision.style, variant: decision.variant });
      } catch {
        if (!cancelled) setChoice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, userId]);

  if (!choice) return null;

  function dismiss() {
    const saved = readPickNudge(userId);
    writePickNudge(userId, {
      sessionId,
      dismissed: true,
      style: saved?.style ?? choice?.style ?? null,
      variant: saved?.variant ?? choice?.variant ?? 0,
    });
    setChoice(null);
  }

  return <PickNudgeView style={choice.style} variant={choice.variant} facts={facts} onDismiss={dismiss} />;
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
  if (style === "receipt") return <LunchReceipt facts={facts} variant={variant} onDismiss={onDismiss} />;
  if (style === "jar") return <TipJarNote onDismiss={onDismiss} />;
  const line = oneLiners[variant % oneLiners.length];
  return (
    <div className="mx-auto mt-4 flex w-full max-w-xl flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-white px-3 py-2 text-sm leading-5 text-stone-800 shadow-sm">
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
  variant,
  onDismiss,
}: {
  facts: PickNudgeFacts;
  variant: number;
  onDismiss: () => void;
}) {
  const lines = receiptLines(facts, variant);
  return (
    <section className="lunch-receipt-sheet mx-auto mt-4 w-full max-w-sm" aria-label="Value for value">
      <div className="lunch-receipt px-4 pb-3 pt-4 text-center">
        <p className="text-sm font-black tracking-[0.22em]" style={{ color: "var(--receipt-accent)" }}>
          LUNCH LOOP
        </p>
        <p className="mt-1 text-xs leading-5 [overflow-wrap:anywhere]" style={{ color: "var(--receipt-muted)" }}>
          {facts.loopName} · {facts.pickedOn}
        </p>
        <div className="my-3 border-t border-dashed" style={{ borderColor: "var(--receipt-rule)" }} />
        <p className="text-[11px] font-bold tracking-[0.16em]" style={{ color: "var(--receipt-ink)" }}>
          TODAY&apos;S PICK
        </p>
        <p className="mt-1 text-lg font-black leading-6 [overflow-wrap:anywhere]" style={{ color: "var(--receipt-accent)" }}>
          {facts.restaurantName}
        </p>
        <div className="my-3 border-t border-dashed" style={{ borderColor: "var(--receipt-rule)" }} />
        <ul className="space-y-1.5 text-left text-[13px] leading-5">
          {lines.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">{line.label}</span>
              <span className="shrink-0 font-bold tabular-nums" style={{ color: line.joke ? "var(--receipt-accent)" : "var(--receipt-ink)" }}>
                {line.value}
              </span>
            </li>
          ))}
        </ul>
        <div className="my-3 border-t border-dashed" style={{ borderColor: "var(--receipt-rule)" }} />
        <div className="flex items-baseline justify-between gap-3 text-sm font-bold">
          <span>DECISION FEE</span>
          <span className="tabular-nums">$0.00</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-sm font-black" style={{ color: "var(--receipt-accent)" }}>
          <span>VALUE RECEIVED</span>
          <span>You decide</span>
        </div>
        <Link
          href="/support"
          className="lunch-receipt-button mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-black"
        >
          Fuel the loop
        </Link>
        <p className="mt-3 text-xs" style={{ color: "var(--receipt-muted)" }}>
          Thank you for eating with us!
        </p>
        <DismissButton onDismiss={onDismiss} tone="receipt" />
      </div>
      <div className="lunch-receipt-zigzag" aria-hidden="true" />
    </section>
  );
}

function TipJarNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mx-auto mt-4 flex w-full max-w-xl items-center gap-3 rounded-2xl bg-white px-3 py-2 text-sm text-stone-800 shadow-sm">
      <TipJarIcon />
      <p className="min-w-0 flex-1">
        <Link href="/support" className="font-black text-orange-800 underline decoration-orange-400 underline-offset-2">
          Tip the loop?
        </Link>
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
