"use client";

import { useEffect, useId, useRef, useState } from "react";
import timeZoneAt from "tz-lookup";
import type { AreaSuggestion } from "@/lib/types";

export type LoopHomeArea = {
  label: string;
  lat: number | null;
  lng: number | null;
  radiusMiles: number;
  timeZone: string;
};

const fallbackTimeZones = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"];
function availableTimeZones() {
  try {
    return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : fallbackTimeZones;
  } catch { return fallbackTimeZones; }
}

function timeZoneLabel(timeZone: string) {
  try {
    const abbreviation = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    const city = timeZone.split("/").at(-1)?.replaceAll("_", " ") ?? timeZone;
    return abbreviation ? `${city} time (${abbreviation})` : `${city} time`;
  } catch {
    return timeZone.replaceAll("_", " ");
  }
}

export function LoopAreaPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: LoopHomeArea;
  onChange: (area: LoopHomeArea) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value.label);
  const [results, setResults] = useState<AreaSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [timeZones] = useState(() => {
    const zones = availableTimeZones();
    return zones.includes(value.timeZone)
      ? zones
      : [value.timeZone, ...zones];
  });

  useEffect(() => setQuery(value.label), [value.label]);
  useEffect(() => {
    const search = query.trim();
    if (search.length < 2 || search === value.label) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/areas/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: search }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { areas?: AreaSuggestion[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Area search could not be completed.");
        setResults(payload.areas ?? []);
      } catch (searchError) {
        if ((searchError as Error).name !== "AbortError") {
          setError(searchError instanceof Error ? searchError.message : "Area search could not be completed.");
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, value.label]);

  const resultKey = results.map((area) => `${area.lat}:${area.lng}:${area.address}`).join("|");
  const [indexedKey, setIndexedKey] = useState(resultKey);
  if (indexedKey !== resultKey) {
    setIndexedKey(resultKey);
    setActiveIndex(0);
  }
  const highlightedIndex = results.length === 0 ? -1 : Math.min(activeIndex < 0 ? 0 : activeIndex, results.length - 1);

  const suggestionsOpen = loading || results.length > 0 || Boolean(error);
  useEffect(() => {
    if (!suggestionsOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setResults([]);
        setError("");
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [suggestionsOpen]);

  const mapUrl =
    value.lat !== null && value.lng !== null
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${value.lat},${value.lng}`)}&z=9&output=embed`
      : null;
  const circleDiameter = `${Math.max(8, Math.min(60, (value.radiusMiles / 35) * 60))}%`;

  function choose(area: AreaSuggestion) {
    const label = area.address ? `${area.label} · ${area.address}` : area.label;
    let timeZone = value.timeZone || "America/Chicago";
    try { timeZone = timeZoneAt(area.lat, area.lng); } catch { /* Keep the current zone if a boundary lookup is unavailable. */ }
    onChange({ ...value, label, lat: area.lat, lng: area.lng, timeZone });
    setQuery(label);
    setResults([]);
    setError("");
    setActiveIndex(0);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!suggestionsOpen) return;
      event.preventDefault();
      setResults([]);
      setError("");
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const area = results[highlightedIndex];
      if (area) choose(area);
    }
  }

  return (
    <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
      <label htmlFor={listId + "-input"} className="block text-sm font-black text-stone-900">
        Center of your search area
      </label>
      <div ref={anchorRef} className="relative z-30 mt-2">
        <input
          id={listId + "-input"}
          value={query}
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen}
          aria-controls={listId}
          aria-activedescendant={highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value !== value.label) {
              onChange({ ...value, label: "", lat: null, lng: null });
            }
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Start with a city, e.g. Evansville, IN"
          autoComplete="off"
          className="w-full rounded-xl border border-orange-200 bg-white px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
        />
        {suggestionsOpen && (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-orange-200 bg-white shadow-lg"
          >
            {loading ? <p className="px-3 py-3 text-sm text-stone-500">Finding places and cities…</p> : null}
            {results.map((area, index) => (
              <button
                key={`${area.lat}:${area.lng}:${area.address}`}
                id={`${listId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(area)}
                className={"block min-h-11 w-full border-b border-stone-100 px-3 py-3 text-left last:border-0 disabled:opacity-60 " + (index === highlightedIndex ? "bg-orange-50" : "hover:bg-orange-50")}
              >
                <strong className="block text-sm">{area.label}</strong>
                <span className="mt-0.5 block text-xs text-stone-500">{area.address}</span>
              </button>
            ))}
            {!loading && !results.length && error ? <p className="px-3 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          </div>
        )}
      </div>
      <label className="mt-5 block text-sm font-black text-stone-900">
        Your crew’s time zone
        <select
          value={value.timeZone}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, timeZone: event.target.value })}
          className="mt-2 w-full rounded-xl border border-orange-200 bg-white px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
        >
          {timeZones.map((timeZone) => (
            <option key={timeZone} value={timeZone}>
              {timeZoneLabel(timeZone)}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-stone-600">We set this automatically from the city you choose. Change it here only if your crew follows a different local clock.</span>
      </label>
      <p className="mt-2 text-xs leading-5 text-stone-600">
        Pick the city or area your crew considers home. We use its map point to keep restaurant searches inside your chosen radius.
      </p>
      <label className="mt-5 block text-sm font-black text-stone-900">
        Search radius: {value.radiusMiles} {value.radiusMiles === 1 ? "mile" : "miles"}
        <input
          type="range"
          min="1"
          max="35"
          value={value.radiusMiles}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, radiusMiles: Number(event.target.value) })}
          className="mt-3 w-full accent-orange-500 disabled:opacity-60"
        />
        <span className="mt-1 flex justify-between text-xs font-normal text-stone-500"><span>1 mile</span><span>35 miles</span></span>
      </label>
      {mapUrl ? (
        <div className="relative mt-5 aspect-square overflow-hidden rounded-2xl border border-orange-200 bg-white">
          <iframe title="Lunch Loop search area map" src={mapUrl} className="pointer-events-none absolute inset-0 size-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div style={{ width: circleDiameter, height: circleDiameter }} className="grid place-items-center rounded-full border-2 border-orange-500 bg-orange-300/20 text-center text-xs font-black text-orange-900 shadow-sm backdrop-blur-[1px]">
              {value.radiusMiles} mi<br />search area
            </div>
          </div>
          <p className="absolute bottom-2 left-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-center text-[11px] font-bold text-stone-700 shadow-sm">
            The circle represents the distance Lunch Loop will search from the selected center.
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-white px-3 py-3 text-sm text-stone-600">Choose an autocomplete result to preview your search area on a map.</p>
      )}
    </div>
  );
}
