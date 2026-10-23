"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pickNudgeDecision, readPickNudge, writePickNudge } from "@/lib/donation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

export function PickValueNudge({ userId, sessionId }: { userId: string; sessionId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_donations_enabled");
        if (cancelled || error || data !== true) return;
        const now = Date.now();
        const saved = readPickNudge(userId);
        const decision = pickNudgeDecision(saved, userId, sessionId, now);
        if (decision === "hide") return;
        if (decision === "show") {
          writePickNudge(userId, { shownAt: now, sessionId, dismissed: false });
        }
        if (!cancelled) setVisible(true);
      } catch {
        setVisible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, userId]);

  if (!visible) return null;

  function dismiss() {
    const saved = readPickNudge(userId);
    writePickNudge(userId, {
      shownAt: saved?.shownAt ?? Date.now(),
      sessionId,
      dismissed: true,
    });
    setVisible(false);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-white/15 px-3 py-2 text-sm leading-5 text-orange-50">
      <p className="min-w-0 flex-1">
        Lunch handled. If Lunch Loop gave you value,{" "}
        <Link href="/support" className="font-black text-white underline decoration-white/70 underline-offset-2">
          send some back.
        </Link>
      </p>
      <button type="button" onClick={dismiss} className="min-h-11 shrink-0 px-1 text-xs font-bold text-orange-100 underline">
        Not now
      </button>
    </div>
  );
}
