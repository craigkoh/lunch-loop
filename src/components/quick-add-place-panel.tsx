"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todaysHours } from "@/lib/location-hours";
import type { PlaceSearchResult } from "@/lib/types";

function placePayload(place: PlaceSearchResult) {
  return {
    google_place_id: place.google_place_id,
    name: place.name,
    address: place.address,
    phone: place.phone ?? null,
    hours: place.hours ?? [],
    rating: place.rating ?? null,
    cuisine: place.cuisine ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
  };
}

/**
 * A compact Google Places lookup for the picker. It deliberately adds to the
 * active loop only; the parent refreshes its private restaurant database after
 * a success, so the new restaurant is immediately eligible for this choice.
 */
export function QuickAddPlacePanel({
  groupId,
  timeZone,
  existingPlaceIds,
  onAdded,
  onClose,
}: {
  groupId: string;
  timeZone: string;
  existingPlaceIds: Set<string>;
  onAdded: (place: PlaceSearchResult) => Promise<void> | void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, PlaceSearchResult[]>());

  const search = useCallback(async (value: string, signal?: AbortSignal) => {
    const clean = value.trim();
    if (clean.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cacheKey = clean.toLocaleLowerCase();
      const cached = cache.current.get(cacheKey);
      if (cached) {
        setResults(cached);
        return;
      }
      const response = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean }),
        signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not search for places.");
      const places = payload.places as PlaceSearchResult[];
      cache.current.set(cacheKey, places);
      setResults(places);
    } catch (searchError) {
      if ((searchError as Error).name !== "AbortError") {
        setResults([]);
        setError(searchError instanceof Error ? searchError.message : "Could not search for places.");
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
    const timer = window.setTimeout(() => void search(clean, controller.signal), 425);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, search]);

  async function addPlace(place: PlaceSearchResult) {
    if (existingPlaceIds.has(place.google_place_id)) return;
    setAddingPlaceId(place.google_place_id);
    setError("");
    try {
      const { data, error: addError } = await createClient().rpc("add_restaurants_to_group", {
        target_group: groupId,
        places: [placePayload(place)],
      });
      if (addError) throw addError;
      if (Number(data ?? 0) === 0) {
        setError("That place is already in your Lunch Database. Try searching for it below.");
        return;
      }
      await onAdded(place);
      onClose();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "That place could not be added.");
    } finally {
      setAddingPlaceId(null);
    }
  }

  return (
    <section className="mt-3 rounded-2xl border border-white/30 bg-white/15 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-white">Add a new place without leaving your picks</p>
          <p className="mt-1 text-xs text-orange-50">Search Google Maps, add it to this Lunch Database, then choose it below.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/90 px-3 py-2 text-xs font-black text-orange-900">Done</button>
      </div>
      <label className="mt-3 block">
        <span className="sr-only">Search for a new restaurant</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Restaurant, cuisine, or neighborhood"
          className="w-full rounded-xl border border-orange-200 bg-white px-3 py-3 text-sm font-semibold text-stone-900 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-orange-300"
        />
      </label>
      <p className="mt-2 text-xs font-semibold text-orange-50" aria-live="polite">
        {query.trim().length < 2 ? "Type at least two letters to search." : loading ? "Finding nearby places…" : results.length ? `${results.length} nearby matches` : ""}
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p>}
      {results.length > 0 && (
        <div className="mt-3 space-y-2" aria-label="Nearby restaurant matches">
          {results.slice(0, 6).map((place) => {
            const alreadyAdded = existingPlaceIds.has(place.google_place_id);
            const isAdding = addingPlaceId === place.google_place_id;
            return (
              <article key={place.google_place_id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-white p-3 text-stone-900">
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-black leading-5">{place.name}</h3>
                  <p className="mt-1 break-words text-xs font-semibold leading-5 text-stone-600">📍 {place.address}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                    {place.cuisine && <span className="rounded-full bg-stone-100 px-2 py-1">{place.cuisine}</span>}
                    {todaysHours(place.hours, new Date(), timeZone) && <span className="rounded-full bg-stone-100 px-2 py-1">{todaysHours(place.hours, new Date(), timeZone)}</span>}
                    {place.rating !== null && place.rating !== undefined && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">★ {place.rating.toFixed(1)}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={alreadyAdded || Boolean(addingPlaceId)}
                  onClick={() => void addPlace(place)}
                  className="shrink-0 self-start rounded-lg bg-orange-500 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-600"
                >
                  {isAdding ? "Adding…" : alreadyAdded ? "Already added" : "Add +"}
                </button>
              </article>
            );
          })}
          {results.length > 6 && <p className="px-1 text-xs font-semibold text-orange-50">Showing the first 6 matches. Refine your search to narrow it down.</p>}
          <p className="px-1 text-xs text-orange-100">Search results from <span translate="no">Google Maps</span></p>
        </div>
      )}
    </section>
  );
}
