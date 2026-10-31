"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "./app-frame";
import { RestaurantCard } from "./restaurant-card";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import type { Restaurant } from "@/lib/types";

export type RestaurantSort =
  | "newest"
  | "oldest"
  | "most-picked"
  | "least-picked"
  | "recently-visited"
  | "never-visited";

export type RestaurantWithContributor = Restaurant & {
  profiles: { display_name: string } | null;
};

const placesPerPage = 6;

const sortLabels: Record<RestaurantSort, string> = {
  newest: "Last added",
  oldest: "First added",
  "most-picked": "Most wins",
  "least-picked": "Fewest wins",
  "recently-visited": "Last won",
  "never-visited": "No wins yet",
};

export function RestaurantSearchFilters({
  search,
  onSearchChange,
  cuisineFilter,
  onCuisineFilterChange,
  cuisines,
  addedByFilter,
  onAddedByFilterChange,
  contributors,
  sort,
  onSortChange,
  dark = false,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  cuisineFilter: string;
  onCuisineFilterChange: (value: string) => void;
  cuisines: string[];
  addedByFilter: string;
  onAddedByFilterChange: (value: string) => void;
  contributors: Array<[string, string]>;
  sort?: RestaurantSort;
  onSortChange?: (value: RestaurantSort) => void;
  dark?: boolean;
}) {
  const labelColor = dark ? "text-orange-50" : "text-muted";
  return (
    <>
      <div className="flex gap-2 rounded-[var(--ll-radius-md)] border border-line bg-surface p-1.5">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search places, cities, cuisines, or who added them…"
          className="min-h-10 min-w-0 flex-1 rounded-[var(--ll-radius-sm)] bg-surface px-2.5 text-base text-ink outline-none placeholder:text-subtle"
          aria-label="Search lunch database"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="rounded-[var(--ll-radius-sm)] px-3 text-sm font-medium text-accent-strong hover:bg-surface-muted"
          >
            Clear
          </button>
        )}
      </div>
      {sort && onSortChange && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Sort lunch database">
          {(Object.keys(sortLabels) as RestaurantSort[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSortChange(option)}
              className={`min-h-10 whitespace-nowrap rounded-full px-3.5 text-sm font-medium ${sort === option ? "bg-accent-strong text-on-accent" : "border border-line bg-surface text-muted hover:text-ink"}`}
            >
              {sortLabels[option]}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className={`text-sm font-medium ${labelColor}`}>
          Cuisine
          <select
            value={cuisineFilter}
            onChange={(event) => onCuisineFilterChange(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-[var(--ll-radius-md)] border border-line bg-surface px-3 text-[15px] font-normal text-ink"
          >
            <option value="">All cuisines</option>
            {cuisines.map((cuisine) => (
              <option key={cuisine} value={cuisine}>
                {cuisine}
              </option>
            ))}
          </select>
        </label>
        <label className={`text-sm font-medium ${labelColor}`}>
          Added by
          <select
            value={addedByFilter}
            onChange={(event) => onAddedByFilterChange(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-[var(--ll-radius-md)] border border-line bg-surface px-3 text-[15px] font-normal text-ink"
          >
            <option value="">Everyone</option>
            {contributors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

function sortRestaurants(
  restaurants: RestaurantWithContributor[],
  sort: RestaurantSort,
) {
  return [...restaurants].sort((a, b) => {
    if (sort === "newest")
      return (b.created_at || "").localeCompare(a.created_at || "");
    if (sort === "oldest")
      return (a.created_at || "").localeCompare(b.created_at || "");
    if (sort === "most-picked")
      return b.visit_count - a.visit_count || a.name.localeCompare(b.name);
    if (sort === "least-picked")
      return a.visit_count - b.visit_count || a.name.localeCompare(b.name);
    if (sort === "recently-visited")
      return (b.last_visited_at || "").localeCompare(
        a.last_visited_at || "",
      );
    return (
      Number(Boolean(a.last_visited_at)) -
        Number(Boolean(b.last_visited_at)) ||
      a.name.localeCompare(b.name)
    );
  });
}

/**
 * The canonical browser for a Lunch Loop's private restaurant database.
 * Database and Settings intentionally share this component so a restaurant is
 * searched, filtered, sorted, opened, and understood the same way everywhere.
 */
export function RestaurantDatabaseBrowser({
  restaurants,
  initialSort = "newest",
  emptyTitle = "Your lunch database is empty",
  emptyChildren = "Add a restaurant to give the crew something to choose from.",
  actions,
  timeZone,
  canManage = false,
  onNeverAgainChange,
}: {
  canManage?: boolean;
  onNeverAgainChange?: (restaurant: Restaurant, neverAgain: boolean) => void;
  restaurants: RestaurantWithContributor[];
  initialSort?: RestaurantSort;
  emptyTitle?: string;
  emptyChildren?: ReactNode;
  actions?: (restaurant: RestaurantWithContributor) => ReactNode;
  timeZone?: string;
}) {
  const [sort, setSort] = useState<RestaurantSort>(initialSort);
  const [search, setSearch] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("");
  const [addedByFilter, setAddedByFilter] = useState("");
  const [page, setPage] = useState(1);
  const [detailRestaurant, setDetailRestaurant] =
    useState<RestaurantWithContributor | null>(null);

  const cuisines = useMemo(
    () =>
      [
        ...new Set(
          restaurants.map((restaurant) => restaurant.cuisine || "Restaurant"),
        ),
      ].sort(),
    [restaurants],
  );
  const contributors = useMemo(
    () =>
      [
        ...new Map(
          restaurants
            .filter(
              (restaurant) =>
                restaurant.added_by && restaurant.profiles?.display_name,
            )
            .map((restaurant) => [
              restaurant.added_by!,
              restaurant.profiles!.display_name,
            ]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [restaurants],
  );
  const visibleRestaurants = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const filtered = restaurants.filter((restaurant) => {
      if (
        cuisineFilter &&
        (restaurant.cuisine || "Restaurant") !== cuisineFilter
      )
        return false;
      if (addedByFilter && restaurant.added_by !== addedByFilter) return false;
      return (
        !term ||
        `${restaurant.name} ${restaurant.address} ${restaurant.cuisine ?? ""} ${restaurant.profiles?.display_name ?? ""}`
          .toLocaleLowerCase()
          .includes(term)
      );
    });
    return sortRestaurants(filtered, sort);
  }, [addedByFilter, cuisineFilter, restaurants, search, sort]);
  const totalPages = Math.max(1, Math.ceil(visibleRestaurants.length / placesPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageRestaurants = visibleRestaurants.slice(
    (currentPage - 1) * placesPerPage,
    currentPage * placesPerPage,
  );

  return (
    <>
      <div className="mt-5">
        <RestaurantSearchFilters
          search={search}
          onSearchChange={(value) => {
            setPage(1);
            setSearch(value);
          }}
          cuisineFilter={cuisineFilter}
          onCuisineFilterChange={(value) => {
            setPage(1);
            setCuisineFilter(value);
          }}
          cuisines={cuisines}
          addedByFilter={addedByFilter}
          onAddedByFilterChange={(value) => {
            setPage(1);
            setAddedByFilter(value);
          }}
          contributors={contributors}
          sort={sort}
          onSortChange={(value) => {
            setPage(1);
            setSort(value);
          }}
        />
      </div>
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {visibleRestaurants.length} matching place
        {visibleRestaurants.length === 1 ? "" : "s"}
      </p>
      {visibleRestaurants.length ? (
        <div className="mt-3 space-y-2">
          {pageRestaurants.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              addedBy={restaurant.profiles?.display_name}
              onOpen={(place) =>
                setDetailRestaurant(place as RestaurantWithContributor)
              }
              timeZone={timeZone}
              action={actions?.(restaurant)}
            />
          ))}
        </div>
      ) : restaurants.length ? (
        <div className="mt-4">
          <EmptyState emoji="🔎" title="No matching places">
            Try another search or filter.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState emoji="🍽️" title={emptyTitle}>
            {emptyChildren}
          </EmptyState>
        </div>
      )}
      {visibleRestaurants.length > 0 && (
        <p className="mt-3 text-sm text-subtle">
          Place information from <span translate="no">Google Maps</span>
        </p>
      )}
      {visibleRestaurants.length > placesPerPage && (
        <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Lunch database pages">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage === 1}
            className="inline-flex min-h-11 items-center rounded-[var(--ll-radius-md)] border border-line bg-surface px-4 text-[15px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-sm text-muted">
            Places {(currentPage - 1) * placesPerPage + 1}–{Math.min(currentPage * placesPerPage, visibleRestaurants.length)} of {visibleRestaurants.length}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={currentPage === totalPages}
            className="inline-flex min-h-11 items-center rounded-[var(--ll-radius-md)] border border-line bg-surface px-4 text-[15px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      )}
      <RestaurantDetailsDialog
        restaurant={detailRestaurant}
        onClose={() => setDetailRestaurant(null)}
        addedBy={detailRestaurant?.profiles?.display_name}
        timeZone={timeZone}
        canManage={canManage}
        onNeverAgainChange={
          onNeverAgainChange
            ? (place, neverAgain) => {
                onNeverAgainChange(place, neverAgain);
                setDetailRestaurant((current) => (current && current.id === place.id ? { ...current, never_again: neverAgain } : current));
              }
            : undefined
        }
      />
    </>
  );
}
