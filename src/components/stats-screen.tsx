"use client";

import Link from "next/link";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import { Avatar } from "./ui/avatar";
import { Card, ListCard, PageHeader, SectionTitle } from "./ui/card";
import { winsLine } from "@/lib/wins";
import type { Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  getGroupContext,
  getGroupMembers,
  type GroupMemberRecord,
} from "@/lib/supabase/group";

type CompletedRound = {
  id: string;
  suggester_id: string;
  final_restaurant_id: string | null;
  completed_at: string | null;
};
type Veto = { candidate_id: string; user_id: string };

export function StatsScreen() {
  const [members, setMembers] = useState<GroupMemberRecord[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(
    null,
  );
  const [rounds, setRounds] = useState<CompletedRound[]>([]);
  const [vetoes, setVetoes] = useState<Veto[]>([]);
  const [candidateCuisine, setCandidateCuisine] = useState(
    new Map<string, string>(),
  );
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
          supabase
            .from("restaurants")
            .select("*")
            .eq("group_id", context.groupId),
          supabase
            .from("lunch_sessions")
            .select("id, suggester_id, final_restaurant_id, completed_at")
            .eq("group_id", context.groupId)
            .eq("status", "completed"),
        ]);
        if (restaurantResult.error) throw restaurantResult.error;
        if (roundResult.error) throw roundResult.error;
        const completed = (roundResult.data ?? []) as CompletedRound[];
        const candidateResult = completed.length
          ? await supabase
              .from("lunch_session_candidates")
              .select("id, restaurant_id")
              .in(
                "session_id",
                completed.map((round) => round.id),
              )
          : { data: [], error: null };
        if (candidateResult.error) throw candidateResult.error;
        const vetoResult = candidateResult.data?.length
          ? await supabase
              .from("vetoes")
              .select("candidate_id, user_id")
              .in(
                "candidate_id",
                candidateResult.data.map((candidate) => candidate.id),
              )
          : { data: [], error: null };
        if (vetoResult.error) throw vetoResult.error;
        const restaurantById = new Map(
          ((restaurantResult.data ?? []) as Restaurant[]).map((restaurant) => [
            restaurant.id,
            restaurant,
          ]),
        );
        setMembers(roster);
        setRestaurants((restaurantResult.data ?? []) as Restaurant[]);
        setRounds(completed);
        setVetoes((vetoResult.data ?? []) as Veto[]);
        setCandidateCuisine(
          new Map(
            (candidateResult.data ?? []).map((candidate) => [
              candidate.id,
              restaurantById.get(candidate.restaurant_id)?.cuisine ||
                "Restaurant",
            ]),
          ),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Stats could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [reloadKey]);

  const data = useMemo(() => {
    const restaurantById = new Map(
      restaurants.map((restaurant) => [restaurant.id, restaurant]),
    );
    const cuisineWins = new Map<string, number>();
    for (const round of rounds) {
      const cuisine =
        restaurantById.get(round.final_restaurant_id ?? "")?.cuisine ||
        "Restaurant";
      cuisineWins.set(cuisine, (cuisineWins.get(cuisine) ?? 0) + 1);
    }
    const heat = new Map<string, number>();
    for (const veto of vetoes) {
      const cuisine = candidateCuisine.get(veto.candidate_id) || "Restaurant";
      const key = `${veto.user_id}|${cuisine}`;
      heat.set(key, (heat.get(key) ?? 0) + 1);
    }
    return {
      cuisineWins: [...cuisineWins.entries()].sort((a, b) => b[1] - a[1]),
      heat: [...heat.entries()]
        .map(([key, count]) => {
          const [userId, cuisine] = key.split("|");
          return { userId, cuisine, count };
        })
        .sort((a, b) => b.count - a.count),
    };
  }, [candidateCuisine, restaurants, rounds, vetoes]);
  const favorite = [...restaurants]
    .filter((restaurant) => !restaurant.never_again)
    .sort((a, b) => b.visit_count - a.visit_count)[0];
  const newestRestaurant = [...restaurants]
    .filter((restaurant) => !restaurant.never_again)
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime() ||
        a.name.localeCompare(b.name),
    )[0];
  const freshCount = restaurants.filter((restaurant) => !restaurant.never_again && restaurant.visit_count === 0).length;
  const maxPicked = Math.max(1, ...members.map((member) => rounds.filter((round) => round.suggester_id === member.user_id).length));
  const memberName = new Map(
    members.map((member) => [member.user_id, member.display_name]),
  );
  const monthName = new Intl.DateTimeFormat(undefined, {
    month: "long",
  }).format(new Date());
  const thisMonth = rounds.filter(
    (round) =>
      round.completed_at &&
      new Date(round.completed_at).getMonth() === new Date().getMonth() &&
      new Date(round.completed_at).getFullYear() === new Date().getFullYear(),
  ).length;

  return (
    <AppFrame>
      <PageHeader eyebrow="The delicious data" title="Stats">
        A little friendly competition, a lot of lunch lore.{" "}
        <Link href="/report" className="font-medium text-accent-strong">Loop report →</Link>
      </PageHeader>
      {loading ? (
        <p className="text-sm text-muted">
          Loading your group’s stats…
        </p>
      ) : error ? (
        <div>
          <EmptyState emoji="📊" title="Stats are unavailable">
            {error}
          </EmptyState>
        </div>
      ) : (
        <>
          {rounds.length === 0 ? (
            <div>
              <EmptyState emoji="📊" title="Your lunch story starts here">
                Complete a lunch decision to unlock group stats and the monthly
                recap.
              </EmptyState>
            </div>
          ) : (
            <>
              <ListCard>
                <li>
                  <button
                    type="button"
                    disabled={!newestRestaurant}
                    onClick={() => newestRestaurant && setDetailRestaurant(newestRestaurant)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-muted disabled:cursor-default"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-muted">New on the list</span>
                      <span className="mt-0.5 block truncate text-[15px] font-semibold">{newestRestaurant?.name ?? "No place yet"}</span>
                    </span>
                    {newestRestaurant?.created_at ? (
                      <span className="shrink-0 text-sm text-subtle">
                        {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(newestRestaurant.created_at))}
                      </span>
                    ) : null}
                    {newestRestaurant ? <span className="text-subtle" aria-hidden="true">›</span> : null}
                  </button>
                </li>
                <li className="flex items-center gap-3 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted">Top cuisine</span>
                    <span className="mt-0.5 block truncate text-[15px] font-semibold">{data.cuisineWins[0]?.[0] ?? "—"}</span>
                  </span>
                  <span className="shrink-0 text-sm text-subtle">{winsLine(data.cuisineWins[0]?.[1] ?? 0)}</span>
                </li>
                <li className="flex items-center gap-3 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted">Fresh places</span>
                    <span className="mt-0.5 block text-[15px] font-semibold">Waiting for a first win</span>
                  </span>
                  <span className="shrink-0 text-[17px] font-semibold tabular-nums">{freshCount}</span>
                </li>
              </ListCard>

              <Card className="mt-4">
                <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
                  {[
                    ["Decisions", rounds.length],
                    ["Vetoes", vetoes.length],
                    ["Total wins", restaurants.reduce((total, restaurant) => total + restaurant.visit_count, 0)],
                    ["Retired", restaurants.filter((restaurant) => restaurant.never_again).length],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-sm text-muted">{label}</dt>
                      <dd className="mt-0.5 text-[28px] font-bold leading-tight tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <SectionTitle className="mt-8" title="Who’s picked" />
              <p className="mt-1 text-sm text-muted">Finished rounds where each person made the picks.</p>
              <ListCard className="mt-3">
                {members.map((member) => {
                  const picked = rounds.filter((round) => round.suggester_id === member.user_id).length;
                  return (
                    <li key={member.user_id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={member.display_name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{member.display_name}</span>
                      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted sm:block" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(picked / maxPicked) * 100}%` }} />
                      </span>
                      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted">{picked} {picked === 1 ? "round" : "rounds"}</span>
                    </li>
                  );
                })}
              </ListCard>

              <section id="cuisine-popularity" className="mt-8">
                <SectionTitle title="Cuisine popularity" />
                <RankedRows
                  rows={data.cuisineWins.map(([cuisine, count]) => ({ key: cuisine, label: cuisine, value: count, unit: winsLine(count) }))}
                  empty="No winning lunches yet."
                />
              </section>

              <section className="mt-8">
                <SectionTitle title="Veto habits" />
                <p className="mt-1 text-sm text-muted">Who tends to veto what.</p>
                <RankedRows
                  rows={data.heat.map((pair) => ({
                    key: `${pair.userId}-${pair.cuisine}`,
                    label: `${memberName.get(pair.userId) ?? "A member"} × ${pair.cuisine}`,
                    value: pair.count,
                    unit: `${pair.count} ${pair.count === 1 ? "veto" : "vetoes"}`,
                  }))}
                  empty="No vetoes have been recorded yet."
                />
              </section>

              <Card className="mt-8">
                <p className="text-sm font-medium text-accent-strong">{monthName} recap</p>
                <h2 className="mt-1 text-[19px] font-semibold tracking-tight">
                  {thisMonth
                    ? `${thisMonth} lunch ${thisMonth === 1 ? "decision" : "decisions"} so far 🍽️`
                    : "Your next lunch sets the tone 🍽️"}
                </h2>
                <p className="mt-1 text-[15px] leading-6 text-muted">
                  {favorite && favorite.visit_count > 0
                    ? `${favorite.name} leads the list with ${winsLine(favorite.visit_count)}.`
                    : "Add a few places and let the crew decide."}
                </p>
              </Card>
            </>
          )}
        </>
      )}
      <RestaurantDetailsDialog
        restaurant={detailRestaurant}
        onClose={() => setDetailRestaurant(null)}
        addedBy={
          detailRestaurant?.added_by
            ? memberName.get(detailRestaurant.added_by)
            : null
        }
      />
    </AppFrame>
  );
}

/** Top five as calm one-line rows, the rest behind “Show all”. Keeps stats from turning into a wall of data. */
function RankedRows({ rows, empty }: { rows: { key: string; label: string; value: number; unit: string }[]; empty: string }) {
  if (!rows.length) return <p className="mt-3 text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.value));
  const row = (item: (typeof rows)[number]) => (
    <li key={item.key} className="flex items-center gap-3 px-5 py-3">
      <span className="min-w-0 flex-1 truncate text-[15px]">{item.label}</span>
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted sm:block" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${(item.value / max) * 100}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">{item.unit}</span>
    </li>
  );
  return (
    <>
      <ListCard className="mt-3">{rows.slice(0, 5).map(row)}</ListCard>
      {rows.length > 5 && (
        <details className="group mt-2">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent-strong">
            <span className="group-open:hidden">Show all {rows.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ListCard className="mt-1">{rows.slice(5).map(row)}</ListCard>
        </details>
      )}
    </>
  );
}
