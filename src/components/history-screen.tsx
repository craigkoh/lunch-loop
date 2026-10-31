"use client";

import Link from "next/link";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { useEffect, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { ListCard, PageHeader, SectionTitle } from "./ui/card";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import type { Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { getGroupContext, getGroupMembers } from "@/lib/supabase/group";

type HistoryItem = {
  id: string;
  scheduled_for: string;
  suggester: string;
  restaurant: Restaurant;
  addedBy: string | null;
  vetoes: string[];
};

export function HistoryScreen() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [neverAgain, setNeverAgain] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<HistoryItem | null>(null);

  // Fresh data when the app comes back into view (no Refresh button).
  const [reloadKey, setReloadKey] = useState(0);
  useRefreshOnFocus(() => setReloadKey((key) => key + 1));
  useEffect(() => {
    async function load() {
      try {
        const context = await getGroupContext();
        const supabase = createClient();
        const [members, restaurantResult, sessionResult] = await Promise.all([
          getGroupMembers(context.groupId),
          supabase
            .from("restaurants")
            .select("*")
            .eq("group_id", context.groupId),
          supabase
            .from("lunch_sessions")
            .select("id, suggester_id, final_restaurant_id, scheduled_for")
            .eq("group_id", context.groupId)
            .eq("status", "completed")
            .order("scheduled_for", { ascending: false }),
        ]);
        if (restaurantResult.error) throw restaurantResult.error;
        if (sessionResult.error) throw sessionResult.error;
        const restaurants = (restaurantResult.data ?? []) as Restaurant[];
        const sessions = sessionResult.data ?? [];
        const sessionIds = sessions.map((session) => session.id);
        const candidateResult = sessionIds.length
          ? await supabase
              .from("lunch_session_candidates")
              .select("id, session_id, restaurant_id")
              .in("session_id", sessionIds)
          : { data: [], error: null };
        if (candidateResult.error) throw candidateResult.error;
        const candidateIds = (candidateResult.data ?? []).map(
          (candidate) => candidate.id,
        );
        const vetoResult = candidateIds.length
          ? await supabase
              .from("vetoes")
              .select("candidate_id, user_id")
              .in("candidate_id", candidateIds)
          : { data: [], error: null };
        if (vetoResult.error) throw vetoResult.error;
        const nameById = new Map(
          members.map((member) => [member.user_id, member.display_name]),
        );
        const candidateById = new Map(
          (candidateResult.data ?? []).map((candidate) => [
            candidate.id,
            candidate,
          ]),
        );
        const restaurantById = new Map(
          restaurants.map((restaurant) => [restaurant.id, restaurant]),
        );
        const vetoesBySession = new Map<string, string[]>();
        for (const veto of vetoResult.data ?? []) {
          const candidate = candidateById.get(veto.candidate_id);
          const restaurant = candidate
            ? restaurantById.get(candidate.restaurant_id)
            : null;
          if (!candidate || !restaurant) continue;
          const line = `${nameById.get(veto.user_id) ?? "A member"} vetoed ${restaurant.name}`;
          vetoesBySession.set(candidate.session_id, [
            ...(vetoesBySession.get(candidate.session_id) ?? []),
            line,
          ]);
        }
        setHistory(
          sessions.flatMap((session) => {
            const restaurant = session.final_restaurant_id
              ? restaurantById.get(session.final_restaurant_id)
              : null;
            return restaurant && session.scheduled_for
              ? [
                  {
                    id: session.id,
                    scheduled_for: session.scheduled_for,
                    suggester: nameById.get(session.suggester_id) ?? "A member",
                    restaurant,
                    addedBy: restaurant.added_by
                      ? (nameById.get(restaurant.added_by) ?? null)
                      : null,
                    vetoes: vetoesBySession.get(session.id) ?? [],
                  },
                ]
              : [];
          }),
        );
        setNeverAgain(
          restaurants.filter((restaurant) => restaurant.never_again),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Lunch history could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [reloadKey]);

  return (
    <AppFrame>
      <PageHeader eyebrow="The record" title="History">
        Every winner, picker, and friendly veto in one spot.{" "}
        <Link href="/report" className="font-medium text-accent-strong">Loop report →</Link>
      </PageHeader>
      {loading ? (
        <p className="text-sm text-muted">Loading lunch history…</p>
      ) : error ? (
        <EmptyState emoji="🗓️" title="History is unavailable">
          {error}
        </EmptyState>
      ) : (
        <>
          {history.length ? (
            groupByMonth(history).map(([month, rounds]) => (
              <section key={month} className="mb-6">
                <SectionTitle title={month} action={<span className="text-sm text-subtle">{rounds.length} {rounds.length === 1 ? "lunch" : "lunches"}</span>} />
                <ListCard className="mt-3">
                  {rounds.map((round) => {
                    const when = new Date(round.scheduled_for);
                    return (
                      <li key={round.id}>
                        <button
                          type="button"
                          onClick={() => setDetail(round)}
                          className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-surface-muted"
                        >
                          <span className="w-10 shrink-0 text-center leading-tight">
                            <span className="block text-sm text-subtle">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
                            <span className="block text-[17px] font-semibold tabular-nums">{when.getDate()}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{round.restaurant.name}</span>
                            <span className="block truncate text-sm text-muted">
                              {[round.restaurant.cuisine || "Restaurant", round.suggester ? `picked by ${round.suggester}` : null].filter(Boolean).join(" · ")}
                            </span>
                            {round.vetoes.length > 0 && (
                              <span className="block truncate text-sm text-subtle">{round.vetoes.join(" · ")}</span>
                            )}
                          </span>
                          <span className="text-subtle" aria-hidden="true">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ListCard>
              </section>
            ))
          ) : (
            <EmptyState emoji="🗓️" title="No lunches decided yet">
              Your completed lunch decisions will appear here.
            </EmptyState>
          )}
          <section className="mt-8">
            <SectionTitle title="Never again" action={<span className="text-sm text-subtle">Retired from the rotation</span>} />
            {neverAgain.length ? (
              <ListCard className="mt-3">
                {neverAgain.map((restaurant) => (
                  <li key={restaurant.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setDetail({
                          id: restaurant.id,
                          scheduled_for: restaurant.last_visited_at ?? restaurant.created_at ?? new Date().toISOString(),
                          suggester: "",
                          restaurant,
                          addedBy: restaurant.added_by ? "A crew member" : null,
                          vetoes: [],
                        })
                      }
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{restaurant.name}</span>
                        <span className="block truncate text-sm text-muted">{restaurant.never_again_note || "The group retired this place."}</span>
                      </span>
                      <span className="text-subtle" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ListCard>
            ) : (
              <p className="mt-3 text-sm text-muted">No places are retired. Places the crew doesn’t want to revisit show up here.</p>
            )}
          </section>
        </>
      )}
      <RestaurantDetailsDialog
        restaurant={detail?.restaurant ?? null}
        onClose={() => setDetail(null)}
        addedBy={detail?.addedBy}
      />
    </AppFrame>
  );
}

function groupByMonth(rounds: HistoryItem[]): [string, HistoryItem[]][] {
  const groups = new Map<string, HistoryItem[]>();
  const newestFirst = [...rounds].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
  for (const round of newestFirst) {
    const label = new Date(round.scheduled_for).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    groups.set(label, [...(groups.get(label) ?? []), round]);
  }
  return [...groups.entries()];
}
