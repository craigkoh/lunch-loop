"use client";

import Link from "next/link";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import { ListCard, PageHeader, SectionTitle } from "./ui/card";
import type { Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { getGroupContext, getGroupMembers, type GroupMemberRecord } from "@/lib/supabase/group";
import { durationLabel, lunchStats, type StatsCandidate, type StatsRound, type StatsVeto } from "@/lib/lunch-stats";

/**
 * Stats (build .76): a handful of value stats, all from data the app already
 * stores. "Who's picked" and the monthly recap are gone (predictable in a
 * standing loop). The math lives in src/lib/lunch-stats.ts.
 */
export function StatsScreen() {
  const [members, setMembers] = useState<GroupMemberRecord[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);
  const [rounds, setRounds] = useState<StatsRound[]>([]);
  const [candidates, setCandidates] = useState<StatsCandidate[]>([]);
  const [vetoes, setVetoes] = useState<StatsVeto[]>([]);
  const [timeZone, setTimeZone] = useState("America/Chicago");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fresh data when the app comes back into view (no Refresh button).
  const [reloadKey, setReloadKey] = useState(0);
  useRefreshOnFocus(() => setReloadKey((key) => key + 1));
  useEffect(() => {
    async function load() {
      try {
        const context = await getGroupContext();
        const supabase = createClient();
        const [roster, restaurantResult, roundResult] = await Promise.all([
          getGroupMembers(context.groupId),
          supabase.from("restaurants").select("*").eq("group_id", context.groupId),
          supabase
            .from("lunch_sessions")
            .select("id, final_restaurant_id, started_at, winner_recorded_at, completed_at, scheduled_for")
            .eq("group_id", context.groupId)
            .eq("status", "completed"),
        ]);
        if (restaurantResult.error) throw restaurantResult.error;
        if (roundResult.error) throw roundResult.error;
        const completed = (roundResult.data ?? []) as StatsRound[];
        const candidateResult = completed.length
          ? await supabase
              .from("lunch_session_candidates")
              .select("id, session_id, restaurant_id")
              .in("session_id", completed.map((round) => round.id))
          : { data: [], error: null };
        if (candidateResult.error) throw candidateResult.error;
        const vetoResult = candidateResult.data?.length
          ? await supabase
              .from("vetoes")
              .select("candidate_id")
              .in("candidate_id", candidateResult.data.map((candidate) => candidate.id))
          : { data: [], error: null };
        if (vetoResult.error) throw vetoResult.error;
        setMembers(roster);
        setRestaurants((restaurantResult.data ?? []) as Restaurant[]);
        setRounds(completed);
        setCandidates((candidateResult.data ?? []) as StatsCandidate[]);
        setVetoes((vetoResult.data ?? []) as StatsVeto[]);
        if (context.timeZone) setTimeZone(context.timeZone);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Stats could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [reloadKey]);

  const stats = useMemo(
    () => lunchStats({ rounds, candidates, vetoes, places: restaurants, timeZone }),
    [rounds, candidates, vetoes, restaurants, timeZone],
  );
  const memberName = new Map(members.map((member) => [member.user_id, member.display_name]));
  const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
  const shortDate = (iso: string, withYear = false) =>
    new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone }).format(new Date(iso));
  const streakWeeks = stats.currentStreakWeeks || stats.bestStreakWeeks;
  const tiles: { value: string; label: string; detail: string }[] = [
    {
      value: String(stats.newPlaces),
      label: "New places tried",
      detail: `Winners across ${stats.lunches} ${stats.lunches === 1 ? "lunch" : "lunches"}`,
    },
    stats.averageDecideMinutes !== null
      ? {
          value: durationLabel(stats.averageDecideMinutes),
          label: "Time to decide",
          detail: stats.fastestDecideMinutes !== null ? `On average · fastest ${durationLabel(stats.fastestDecideMinutes)}` : "On average",
        }
      : { value: "—", label: "Time to decide", detail: "Shows after the next round" },
    {
      value: `${streakWeeks} ${streakWeeks === 1 ? "wk" : "wks"}`,
      label: stats.currentStreakWeeks ? "Lunch streak" : "Best lunch streak",
      detail:
        stats.currentStreakWeeks && stats.currentStreakWeeks === stats.bestStreakWeeks && stats.streakStart
          ? `Every week since ${shortDate(stats.streakStart)}`
          : stats.currentStreakWeeks
            ? `Best: ${stats.bestStreakWeeks} weeks`
            : "Weeks in a row with a lunch",
    },
    stats.favorites[0]
      ? { value: `${stats.favorites[0].wins}×`, label: "Top comeback", detail: stats.favorites[0].name }
      : { value: "—", label: "Top comeback", detail: "No repeat winner yet" },
  ];
  const facts: [string, string][] = [
    ...(stats.favoriteDay ? [["Favorite lunch day", stats.favoriteDay.day] as [string, string]] : []),
    ...(stats.favoriteCuisine ? [["Favorite cuisine", `${stats.favoriteCuisine.cuisine} · ${stats.favoriteCuisine.wins} ${stats.favoriteCuisine.wins === 1 ? "win" : "wins"}`] as [string, string]] : []),
    ...(stats.toughestWinner ? [["Most vetoes survived", `${stats.toughestWinner.name} · ${stats.toughestWinner.vetoes}`] as [string, string]] : []),
    ["Waiting for a first win", `${stats.waitingForFirstWin} ${stats.waitingForFirstWin === 1 ? "place" : "places"}`],
  ];

  return (
    <AppFrame>
      <PageHeader eyebrow="Your crew in numbers" title="Stats" />
      {loading ? (
        <p className="text-[15px] text-muted">Loading your crew’s stats…</p>
      ) : error ? (
        <EmptyState emoji="📊" title="Stats are unavailable">{error}</EmptyState>
      ) : rounds.length === 0 ? (
        <EmptyState emoji="📊" title="Your lunch story starts here">
          Finish a lunch to see your crew’s numbers.
        </EmptyState>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map((tile, index) => (
              <div key={tile.label} className="rounded-[var(--ll-radius-lg)] bg-surface p-4 shadow-[var(--ll-shadow-card)]">
                <dd className={`text-[28px] font-bold leading-tight tracking-tight tabular-nums ${index === 0 ? "text-accent-strong" : ""}`}>{tile.value}</dd>
                <dt className="mt-1 text-[15px] font-semibold leading-5">{tile.label}</dt>
                <dd className="mt-1 text-sm leading-5 text-muted">{tile.detail}</dd>
              </div>
            ))}
          </dl>

          {stats.favorites.length > 0 && (
            <section className="mt-8">
              <SectionTitle title="Favorites you return to" />
              <ListCard className="mt-3">
                {stats.favorites.map((favorite) => {
                  const place = restaurantById.get(favorite.id);
                  const weeks = favorite.everyDays ? Math.max(1, Math.round(favorite.everyDays / 7)) : null;
                  return (
                    <li key={favorite.id}>
                      <button
                        type="button"
                        disabled={!place}
                        onClick={() => place && setDetailRestaurant(place)}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-muted disabled:cursor-default"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{favorite.name}</span>
                          <span className="mt-0.5 block text-sm text-muted">
                            {favorite.wins} visits · {weeks ? `about every ${weeks === 1 ? "week" : `${weeks} weeks`}` : `last on ${shortDate(favorite.lastDate)}`}
                          </span>
                        </span>
                        {place ? <span className="text-subtle" aria-hidden="true">›</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ListCard>
            </section>
          )}

          <section className="mt-8">
            <SectionTitle title="Little facts" />
            <ListCard className="mt-3">
              {facts.map(([label, value]) => (
                <li key={label} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <span className="min-w-0 text-[15px] text-muted">{label}</span>
                  <span className="min-w-0 text-right text-[15px] font-semibold">{value}</span>
                </li>
              ))}
            </ListCard>
          </section>

          <p className="mt-8 flex justify-center gap-6 text-[15px]">
            <Link href="/report" className="font-medium text-accent-strong">Loop report →</Link>
            <Link href="/history" className="font-medium text-accent-strong">History →</Link>
          </p>
        </>
      )}
      <RestaurantDetailsDialog
        restaurant={detailRestaurant}
        onClose={() => setDetailRestaurant(null)}
        addedBy={detailRestaurant?.added_by ? memberName.get(detailRestaurant.added_by) : null}
        timeZone={timeZone}
      />
    </AppFrame>
  );
}
