"use client";

import { useEffect, useState } from "react";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import Link from "next/link";
import { buttonClass } from "./ui/button";
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
  const [isOwner, setIsOwner] = useState(false);
  // Fresh data when the app comes back into view (no Refresh button).
  const [reloadKey, setReloadKey] = useState(0);
  useRefreshOnFocus(() => setReloadKey((key) => key + 1));
  useEffect(() => {
    async function load() {
      try {
        const group = await getGroupContext();
        setTimeZone(group.timeZone);
        setIsOwner(group.role === "owner");
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
  }, [reloadKey]);
  return (
    <AppFrame>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent-strong">
            Your loop’s list
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">
            Places
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Every place the crew can pick. Tap one for the map, hours, and directions.
          </p>
        </div>
        <Link
          href="/add-place"
          className={buttonClass("primary")}
        >
          ＋ Add place
        </Link>
      </div>
      {loading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading places…
        </p>
      ) : error ? (
        <div className="mt-6">
          <EmptyState emoji="🍽️" title="Database unavailable">
            {error}
          </EmptyState>
        </div>
      ) : (
        <>
          <RestaurantDatabaseBrowser
            restaurants={restaurants}
            initialSort={initialSort}
            timeZone={timeZone}
            canManage={isOwner}
            onNeverAgainChange={(place, neverAgain) =>
              setRestaurants((current) => current.map((item) => (item.id === place.id ? { ...item, never_again: neverAgain } : item)))
            }
          />
        </>
      )}
    </AppFrame>
  );
}
