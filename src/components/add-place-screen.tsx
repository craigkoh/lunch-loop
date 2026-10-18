"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppFrame, EmptyState } from "./app-frame";
import { RestaurantDetailsDialog } from "./restaurant-details-dialog";
import type { PlaceSearchResult, Restaurant } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { getGroupContext, getMyLunchLoops } from "@/lib/supabase/group";
import { todaysHours } from "@/lib/location-hours";

type ExistingPlace = Pick<
  Restaurant,
  | "id"
  | "google_place_id"
  | "created_at"
  | "visit_count"
  | "last_visited_at"
  | "never_again"
  | "never_again_note"
  | "added_by"
> & { profiles: { display_name: string } | null };

const placesPerPage = 6;

export function AddPlaceScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);
  const [timeZone, setTimeZone] = useState("America/Chicago");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [resultsPage, setResultsPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<Record<string, ExistingPlace>>({});
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(
    null,
  );
  const cache = useRef(new Map<string, PlaceSearchResult[]>());

  const loadExisting = useCallback(async (targetGroupId: string) => {
    const { data, error: loadError } = await createClient()
      .from("restaurants")
      .select(
        "id, google_place_id, created_at, visit_count, last_visited_at, never_again, never_again_note, added_by, profiles!restaurants_added_by_fkey(display_name)",
      )
      .eq("group_id", targetGroupId);
    if (loadError) throw loadError;
    const next: Record<string, ExistingPlace> = {};
    for (const item of data ?? []) {
      const place = item as unknown as ExistingPlace;
      next[place.google_place_id] = place;
    }
    setExisting(next);
  }, []);

  useEffect(() => {
    async function loadGroup() {
      try {
        const context = await getGroupContext();
        setGroupId(context.groupId);
        setTimeZone(context.timeZone);
        const loops = await getMyLunchLoops();
        const loop = loops.find((item) => item.group_id === context.groupId);
        setAreaLabel(loop?.home_label ?? null);
        setRadiusMiles(loop?.search_radius_miles ?? null);
        await loadExisting(context.groupId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Your lunch group could not be loaded.",
        );
      } finally {
        setGroupLoading(false);
      }
    }
    void loadGroup();
  }, [loadExisting]);

  const runSearch = useCallback(async (value: string, signal?: AbortSignal) => {
    const clean = value.trim();
      if (clean.length < 2) {
        setResults([]);
        setResultsPage(1);
        return;
    }
    setLoading(true);
    setError("");
    try {
      const cached = cache.current.get(clean.toLowerCase());
      if (cached) {
        setResults(cached);
        setResultsPage(1);
        return;
      }
      const response = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean }),
        signal,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not search for places.");
      const places = payload.places as PlaceSearchResult[];
      cache.current.set(clean.toLowerCase(), places);
      setResults(places);
      setResultsPage(1);
    } catch (searchError) {
      if ((searchError as Error).name !== "AbortError") {
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Could not search for places.",
        );
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void runSearch(clean, controller.signal);
    }, 425);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, runSearch]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function addSelected() {
    if (!groupId) {
      setError("Create or join a lunch group before adding places.");
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const supabase = createClient();
      const rows = results
        .filter(
          (place) =>
            selected.includes(place.google_place_id) &&
            !existing[place.google_place_id],
        )
        .map((place) => ({
          google_place_id: place.google_place_id,
          name: place.name,
          address: place.address,
          phone: place.phone ?? null,
          hours: place.hours ?? [],
          rating: place.rating ?? null,
          cuisine: place.cuisine ?? null,
          lat: place.lat ?? null,
          lng: place.lng ?? null,
        }));
      if (!rows.length) {
        setNotice("Those places are already in your shared list.");
        setSelected([]);
        return;
      }
      const { data: addedCount, error: insertError } = await supabase.rpc(
        "add_restaurants_to_group",
        { target_group: groupId, places: rows },
      );
      if (insertError) throw insertError;
      setNotice(
        `${addedCount ?? rows.length} place${(addedCount ?? rows.length) === 1 ? "" : "s"} added to the shared list.`,
      );
      setSelected([]);
      await loadExisting(groupId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save those places.",
      );
    } finally {
      setSaving(false);
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }
  const totalResultPages = Math.max(1, Math.ceil(results.length / placesPerPage));
  const currentResultsPage = Math.min(resultsPage, totalResultPages);
  const pageResults = results.slice(
    (currentResultsPage - 1) * placesPerPage,
    currentResultsPage * placesPerPage,
  );

  return (
    <AppFrame>
      <div className="max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
          Build the list
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          Add a lunch spot
        </h1>
        <p className="mt-2 text-stone-600">
          Start typing a name or craving. Search results update as you type and
          stay within your loop’s {areaLabel ?? "chosen"} search area{radiusMiles ? ` (${radiusMiles} miles)` : ""}.
        </p>
      </div>
      {groupLoading ? (
        <p className="mt-6 text-sm font-semibold text-stone-500">
          Loading your shared list…
        </p>
      ) : !groupId ? (
        <div className="mt-6">
          <EmptyState emoji="👥" title="Create or join your crew first">
            {error || "A lunch group is needed before places can be shared."}
            <Link
              href="/"
              className="mt-4 inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white"
            >
              Set up your crew
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          <form
            onSubmit={submit}
            className="mt-6 rounded-2xl border border-orange-200 bg-white p-2 shadow-sm"
          >
            <label className="sr-only" htmlFor="place-search">
              Restaurant name or cuisine
            </label>
            <div className="flex gap-2">
              <input
                id="place-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                minLength={2}
                autoComplete="off"
                placeholder="Try “tacos”, “Geraldine’s”, or “Thai”"
                className="min-w-0 flex-1 rounded-xl px-3 py-3 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-orange-300"
              />
              <button
                disabled={loading || query.trim().length < 2}
                className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
            <p
              className="px-3 pb-1 pt-2 text-xs text-stone-500"
              aria-live="polite"
            >
              {query.trim().length < 2
                ? "Type at least two letters to search."
                : loading
                  ? "Finding nearby places…"
                  : results.length
                    ? `${results.length} nearby matches`
                    : ""}
            </p>
          </form>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
            >
              {notice}
            </p>
          )}
          {results.length > 0 && (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black">Nearby matches</h2>
                  <p className="text-sm text-stone-500">
                    Check one or more places to add them.
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    Search results from <span translate="no">Google Maps</span>
                  </p>
                </div>
                <span className="text-sm font-bold text-stone-600">
                  {selected.length} selected
                </span>
              </div>
              <div className="space-y-3">
                {pageResults.map((place) => {
                  const saved = existing[place.google_place_id];
                  const hoursToday = todaysHours(place.hours, new Date(), timeZone);
                  return (
                    <label
                      key={place.google_place_id}
                      className={`flex gap-3 rounded-2xl border p-4 shadow-sm transition ${saved ? "border-emerald-200 bg-emerald-50/50" : selected.includes(place.google_place_id) ? "border-orange-400 bg-orange-50" : "border-orange-100 bg-white"}`}
                    >
                      <input
                        className="mt-1 size-5 accent-orange-500 disabled:cursor-not-allowed"
                        type="checkbox"
                        checked={
                          Boolean(saved) ||
                          selected.includes(place.google_place_id)
                        }
                        disabled={Boolean(saved)}
                        onChange={() => toggle(place.google_place_id)}
                        aria-label={`Select ${place.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="font-extrabold">{place.name}</h3>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                setDetailRestaurant({
                                  id: saved?.id ?? place.google_place_id,
                                  ...place,
                                  visit_count: saved?.visit_count ?? 0,
                                  last_visited_at:
                                    saved?.last_visited_at ?? null,
                                  never_again: saved?.never_again ?? false,
                                  never_again_note:
                                    saved?.never_again_note ?? null,
                                  added_by: saved?.added_by ?? null,
                                  created_at: saved?.created_at,
                                });
                              }}
                              className="rounded-lg bg-orange-50 px-2 py-1 text-xs font-black text-orange-800"
                            >
                              Details
                            </button>
                            {place.rating !== null &&
                              place.rating !== undefined && (
                                <span className="font-bold text-amber-700">
                                  ★ {place.rating.toFixed(1)}
                                </span>
                              )}
                          </div>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-stone-700">
                          📍 {place.address}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full bg-stone-100 px-2 py-1 capitalize">
                            {place.cuisine}
                          </span>
                          {hoursToday && (
                            <span className="rounded-full bg-stone-100 px-2 py-1">
                              {hoursToday}
                            </span>
                          )}
                          {place.phone && (
                            <span className="rounded-full bg-stone-100 px-2 py-1">
                              {place.phone}
                            </span>
                          )}
                        </div>
                        {saved && (
                          <p className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">
                            Already in your list
                            {saved.profiles?.display_name
                              ? ` · added by ${saved.profiles.display_name}`
                              : ""}{" "}
                            {saved.created_at
                              ? ` on ${new Date(saved.created_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}.`
                              : "."}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              {results.length > placesPerPage && (
                <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-3 py-3" aria-label="Nearby place result pages">
                  <button
                    type="button"
                    onClick={() => setResultsPage((page) => Math.max(1, page - 1))}
                    disabled={currentResultsPage === 1}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-black text-stone-800 shadow-sm disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm font-bold text-stone-600">
                    Places {(currentResultsPage - 1) * placesPerPage + 1}–{Math.min(currentResultsPage * placesPerPage, results.length)} of {results.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setResultsPage((page) => Math.min(totalResultPages, page + 1))}
                    disabled={currentResultsPage === totalResultPages}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-black text-stone-800 shadow-sm disabled:opacity-40"
                  >
                    Next →
                  </button>
                </nav>
              )}
              {selected.length > 0 && (
                <button
                  disabled={saving}
                  onClick={() => void addSelected()}
                  className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-black text-white disabled:opacity-60 sm:w-auto"
                >
                  {saving ? "Adding…" : `Add ${selected.length} to shared list`}
                </button>
              )}
            </section>
          )}
          {!loading &&
            !error &&
            results.length === 0 &&
            query.trim().length < 2 && (
              <div className="mt-8">
                <EmptyState emoji="🔎" title="Think of a place? Add it here.">
                  Search by restaurant name, cuisine, or neighborhood whenever
                  inspiration strikes.
                </EmptyState>
              </div>
            )}
        </>
      )}
      <RestaurantDetailsDialog
        restaurant={detailRestaurant}
        onClose={() => setDetailRestaurant(null)}
        timeZone={timeZone}
        addedBy={
          detailRestaurant?.google_place_id
            ? existing[detailRestaurant.google_place_id]?.profiles?.display_name
            : null
        }
      />
    </AppFrame>
  );
}
