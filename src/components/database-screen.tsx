"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppFrame, EmptyState } from "./app-frame";
import {
  RestaurantDatabaseBrowser,
  type RestaurantSort,
  type RestaurantWithContributor,
} from "./restaurant-database-browser";
import { createClient } from "@/lib/supabase/client";
import { getGroupContext } from "@/lib/supabase/group";

export type Sort = RestaurantSort;

export function DatabaseScreen({
  initialSort = "newest",
}: {
  initialSort?: Sort;
}) {
  const [restaurants, setRestaurants] = useState<RestaurantWithContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeZone, setTimeZone] = useState("America/Chicago");
  useEffect(() => {
    async function load() {
      try {
        const group = await getGroupContext();
        setTimeZone(group.timeZone);
        const { data, error: loadError } = await createClient()
          .from("restaurants")
          .select("*, profiles!restaurants_added_by_fkey(display_name)")
          .eq("group_id", group.groupId);
        if (loadError) throw loadError;
        setRestaurants((data ?? []) as unknown as RestaurantWithContributor[]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The lunch database could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);
  return (
    <AppFrame>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
            Shared knowledge
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            Lunch database
          </h1>
          <p className="mt-2 text-stone-600">
            Every place your group can choose from. Tap any place for details,
            map, hours, and directions.
          </p>
        </div>
        <Link
          href="/add-place"
          className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white"
        >
          Add place
        </Link>
      </div>
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading the lunch database…
        </p>
      ) : error ? (
        <div className="mt-6">
          <EmptyState emoji="🍽️" title="Database unavailable">
            {error}
          </EmptyState>
        </div>
      ) : (
        <>
          <RestaurantDatabaseBrowser restaurants={restaurants} initialSort={initialSort} timeZone={timeZone} />
        </>
      )}
    </AppFrame>
  );
}
