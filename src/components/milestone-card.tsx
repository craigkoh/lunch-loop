"use client";

import { useEffect, useState } from "react";
import { computeMilestones, type Milestone, type MilestoneFacts } from "@/lib/milestones";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

/** One dismissible celebration card on Home. Dismissals are saved per person. */
export function MilestoneCard({ groupId, userId, refreshKey }: { groupId: string; userId: string; refreshKey?: number }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  useEffect(() => {
    if (!hasSupabaseEnv() || !groupId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient().rpc("get_my_loop_milestone_facts", { target_group: groupId });
      if (!cancelled && !error) setMilestones(computeMilestones(data as MilestoneFacts, userId));
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, userId, refreshKey]);

  const milestone = milestones[0];
  if (!milestone) return null;

  async function dismiss() {
    setMilestones((current) => current.filter((item) => item.key !== milestone.key));
    await createClient()
      .from("lunch_loop_milestone_dismissals")
      .insert({ user_id: userId, group_id: groupId, milestone_key: milestone.key });
  }

  return (
    <section className="mt-4 flex items-center gap-4 rounded-[var(--ll-radius-lg)] bg-surface p-4 shadow-[var(--ll-shadow-card)]" aria-live="polite">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">
        {milestone.emoji}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{milestone.title}</p>
        <p className="text-sm text-muted">{milestone.body}</p>
      </div>
      <button type="button" onClick={() => void dismiss()} className="ml-auto grid size-11 shrink-0 place-items-center text-subtle" aria-label={`Dismiss: ${milestone.title}`}>
        ✕
      </button>
    </section>
  );
}
