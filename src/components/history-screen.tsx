"use client";

import { useEffect, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantCard } from "./restaurant-card";
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
  }, []);

  return (
    <AppFrame>
      <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
        The record
      </p>
      <h1 className="mt-1 text-3xl font-black tracking-tight">Lunch history</h1>
      <p className="mt-2 text-stone-600">
        Every final pick, suggester, and friendly veto in one spot.
      </p>
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading lunch history…
        </p>
      ) : error ? (
        <div className="mt-6">
          <EmptyState emoji="🗓️" title="History is unavailable">
            {error}
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-black">Recent lunches</h2>
            {history.length ? (
              <div className="mt-3 space-y-3">
                {history.map((round) => (
                  <button
                    key={round.id}
                    type="button"
                    onClick={() => setDetail(round)}
                    className="w-full rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:ring-2 hover:ring-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                          {new Date(round.scheduled_for).toLocaleDateString(
                            undefined,
                            {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </p>
                        <h3 className="mt-1 font-black">
                          {round.restaurant.name}{" "}
                          <span className="font-semibold text-stone-400">
                            · {round.restaurant.cuisine || "Restaurant"}
                          </span>
                        </h3>
                      </div>
                      <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">
                        {round.suggester} suggested
                      </span>
                    </div>
                    {round.vetoes.length > 0 && (
                      <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-500">
                        {round.vetoes.join(" · ")}
                      </p>
                    )}
                    <p className="mt-3 text-xs font-bold text-orange-700">
                      View details, map, and directions →
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState emoji="🗓️" title="No lunches decided yet">
                  Your completed lunch decisions will appear here.
                </EmptyState>
              </div>
            )}
          </section>
          <section className="mt-8">
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-wide text-rose-600">
                Retired from the rotation
              </p>
              <h2 className="text-lg font-black">Never again</h2>
            </div>
            {neverAgain.length ? (
              <div className="space-y-3">
                {neverAgain.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    onOpen={(place) =>
                      setDetail({
                        id: place.id,
                        scheduled_for:
                          place.last_visited_at ??
                          place.created_at ??
                          new Date().toISOString(),
                        suggester: "",
                        restaurant: place,
                        addedBy: place.added_by ? "A crew member" : null,
                        vetoes: [],
                      })
                    }
                    action={
                      <p className="text-sm text-rose-700">
                        {restaurant.never_again_note ||
                          "The group retired this place."}
                      </p>
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState emoji="💚" title="No places are retired">
                Places your group does not want to revisit will appear here.
              </EmptyState>
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
