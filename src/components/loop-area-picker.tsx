"use client";

import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  }

  return (
    <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
      <label className="block text-sm font-black text-stone-900">
        Center of your search area
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value !== value.label) {
              onChange({ ...value, label: "", lat: null, lng: null });
            }
          }}
          placeholder="Start with a city, e.g. Evansville, IN"
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-orange-200 bg-white px-3 py-3 font-normal outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
        />
      </label>
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
      {(loading || results.length > 0 || error) && (
        <div className="relative mt-2">
          <div className="absolute z-10 w-full overflow-hidden rounded-xl border border-orange-200 bg-white shadow-lg">
            {loading ? <p className="px-3 py-3 text-sm text-stone-500">Finding places and cities…</p> : null}
            {results.map((area) => (
              <button
                key={`${area.lat}:${area.lng}:${area.address}`}
                type="button"
                disabled={disabled}
                onClick={() => choose(area)}
                className="block w-full border-b border-stone-100 px-3 py-3 text-left last:border-0 hover:bg-orange-50 disabled:opacity-60"
              >
                <strong className="block text-sm">{area.label}</strong>
                <span className="mt-0.5 block text-xs text-stone-500">{area.address}</span>
              </button>
            ))}
            {!loading && !results.length && error ? <p className="px-3 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          </div>
        </div>
      )}
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
