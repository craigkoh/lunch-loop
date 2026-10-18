"use client";

import { useEffect, useMemo, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
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
  }, []);

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
  const maxCuisine = Math.max(1, ...data.cuisineWins.map(([, count]) => count));
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
      <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
        The delicious data
      </p>
      <h1 className="mt-1 text-3xl font-black tracking-tight">Group stats</h1>
      <p className="mt-2 text-stone-600">
        A little friendly competition, a lot of lunch lore.
      </p>
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading your group’s stats…
        </p>
      ) : error ? (
        <div className="mt-6">
          <EmptyState emoji="📊" title="Stats are unavailable">
            {error}
          </EmptyState>
        </div>
      ) : (
        <>
          {rounds.length === 0 ? (
            <div className="mt-6">
              <EmptyState emoji="📊" title="Your lunch story starts here">
                Complete a lunch decision to unlock group stats and the monthly
                recap.
              </EmptyState>
            </div>
          ) : (
            <>
              <section className="mt-6 grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={!newestRestaurant}
                  onClick={() =>
                    newestRestaurant && setDetailRestaurant(newestRestaurant)
                  }
                  className="rounded-2xl bg-orange-500 p-4 text-left text-white transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-default"
                >
                  <p className="text-sm font-bold text-orange-100">
                    New on the list
                  </p>
                  <p className="mt-2 text-xl font-black">
                    {newestRestaurant?.name ?? "No place yet"}
                  </p>
                  <p className="mt-1 text-sm text-orange-50">
                    {newestRestaurant
                      ? newestRestaurant.created_at
                        ? `Added ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(newestRestaurant.created_at))}`
                        : "Recently added"
                      : "Add a place to begin"}
                  </p>
                  {newestRestaurant && (
                    <p className="mt-3 text-xs font-bold text-orange-100">
                      View details, map, and directions →
                    </p>
                  )}
                </button>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-sm font-bold text-stone-400">
                    Top cuisine
                  </p>
                  <p className="mt-2 text-xl font-black">
                    {data.cuisineWins[0]?.[0] ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    {data.cuisineWins[0]?.[1] ?? 0} winning lunches
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-sm font-bold text-stone-400">
                    Fresh places
                  </p>
                  <p className="mt-2 text-xl font-black">
                    {
                      restaurants.filter(
                        (restaurant) =>
                          !restaurant.never_again &&
                          restaurant.visit_count === 0,
                      ).length
                    }
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    waiting for a first visit
                  </p>
                </div>
              </section>
              <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-stone-400">DECISIONS</p>
                  <p className="mt-1 text-2xl font-black">{rounds.length}</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-stone-400">VETOES</p>
                  <p className="mt-1 text-2xl font-black">{vetoes.length}</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-stone-400">
                    TOTAL VISITS
                  </p>
                  <p className="mt-1 text-2xl font-black">
                    {restaurants.reduce(
                      (total, restaurant) => total + restaurant.visit_count,
                      0,
                    )}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-stone-400">RETIRED</p>
                  <p className="mt-1 text-2xl font-black">
                    {
                      restaurants.filter((restaurant) => restaurant.never_again)
                        .length
                    }
                  </p>
                </div>
              </section>
              <section className="mt-8">
                <h2 className="text-lg font-black">Suggester win rate</h2>
                <p className="mt-1 text-sm text-stone-500">
                  One of each suggester’s choices becomes the final pick.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {members.map((member) => {
                    const wins = rounds.filter(
                      (round) => round.suggester_id === member.user_id,
                    ).length;
                    const suggestions = wins * members.length;
                    const rate = suggestions
                      ? Math.round((wins / suggestions) * 100)
                      : 0;
                    return (
                      <div
                        key={member.user_id}
                        className="rounded-2xl bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <strong>{member.display_name}</strong>
                          <span className="font-black text-orange-600">
                            {rate}%
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className="h-full rounded-full bg-orange-500"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <p className="mt-2 text-sm text-stone-500">
                          {wins} winning pick{wins === 1 ? "" : "s"} from{" "}
                          {suggestions} suggestions
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="mt-8 grid gap-6 md:grid-cols-2">
                <div id="cuisine-popularity">
                  <h2 className="text-lg font-black">Cuisine popularity</h2>
                  <div className="mt-3 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                    {data.cuisineWins.map(([cuisine, count]) => (
                      <div key={cuisine}>
                        <div className="flex justify-between text-sm font-bold">
                          <span>{cuisine}</span>
                          <span>
                            {count} win{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${(count / maxCuisine) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-black">Veto heat map</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Who tends to veto what?
                  </p>
                  {data.heat.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {data.heat.map((pair) => (
                        <div
                          key={`${pair.userId}-${pair.cuisine}`}
                          className="rounded-2xl bg-rose-50 p-4"
                        >
                          <p className="text-sm font-black text-rose-900">
                            {memberName.get(pair.userId) ?? "A member"} ×{" "}
                            {pair.cuisine}
                          </p>
                          <p className="mt-1 text-2xl font-black text-rose-600">
                            {pair.count}
                          </p>
                          <p className="text-xs font-semibold text-rose-700">
                            veto{pair.count !== 1 ? "es" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-stone-500 shadow-sm">
                      No vetoes have been recorded yet.
                    </p>
                  )}
                </div>
              </section>
              <section className="mt-8 rounded-3xl bg-amber-100 p-5">
                <p className="text-sm font-bold uppercase tracking-widest text-amber-800">
                  {monthName} recap
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {thisMonth
                    ? `${thisMonth} lunch ${thisMonth === 1 ? "decision" : "decisions"} so far`
                    : "Your next lunch sets the tone"}{" "}
                  🍽️
                </h2>
                <p className="mt-2 text-stone-700">
                  {favorite
                    ? `${favorite.name} leads the list with ${favorite.visit_count} ${favorite.visit_count === 1 ? "visit" : "visits"}.`
                    : "Add a few places and let the crew decide."}
                </p>
              </section>
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
