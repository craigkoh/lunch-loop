"use client";

import { useEffect, useState } from "react";
import type { Restaurant } from "@/lib/types";
import { hoursAtPlannedLunch, todaysHours } from "@/lib/location-hours";
import { createClient } from "@/lib/supabase/client";

function dateLabel(value?: string | null, timeZone?: string) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(value))
    : null;
}

export function RestaurantDetailsDialog({
  restaurant,
  onClose,
  addedBy,
  plannedFor,
  timeZone,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
  addedBy?: string | null;
  plannedFor?: Date | string | null;
  timeZone?: string;
}) {
  const [decisionFacts, setDecisionFacts] = useState({
    appearances: 0,
    vetoes: 0,
    vetoers: 0,
  });
  useEffect(() => {
    let cancelled = false;
    async function loadDecisionFacts() {
      if (!restaurant) {
        setDecisionFacts({ appearances: 0, vetoes: 0, vetoers: 0 });
        return;
      }
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .rpc("get_restaurant_decision_facts", {
            target_restaurant: restaurant.id,
          })
          .single<{
            appearances: number;
            vetoes: number;
            vetoers: number;
          }>();
        if (error) throw error;
        if (!cancelled)
          setDecisionFacts({
            appearances: Number(data?.appearances ?? 0),
            vetoes: Number(data?.vetoes ?? 0),
            vetoers: Number(data?.vetoers ?? 0),
          });
      } catch {
        if (!cancelled)
          setDecisionFacts({ appearances: 0, vetoes: 0, vetoers: 0 });
      }
    }
    void loadDecisionFacts();
    return () => {
      cancelled = true;
    };
  }, [restaurant?.id]);
  if (!restaurant) return null;
  const plannedAt = plannedFor ? new Date(plannedFor) : null;
  const plannedHours = plannedAt
    ? hoursAtPlannedLunch(restaurant.hours, plannedAt, timeZone)
    : null;
  const todayHours = todaysHours(restaurant.hours, new Date(), timeZone);
  const mapQuery =
    restaurant.lat !== null &&
    restaurant.lat !== undefined &&
    restaurant.lng !== null &&
    restaurant.lng !== undefined
      ? `${restaurant.lat},${restaurant.lng}`
      : restaurant.address;
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}`;
  const embedUrl = `${mapUrl}&z=15&output=embed`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-stone-950/55 p-3 sm:items-center sm:justify-center"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurant-detail-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 text-stone-900 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
              Restaurant details
            </p>
            <h2
              id="restaurant-detail-title"
              className="mt-1 text-2xl font-black"
            >
              {restaurant.name}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              📍 {restaurant.address}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-black text-stone-700"
            aria-label="Close restaurant details"
          >
            Close
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-stone-100 px-3 py-2">
            {restaurant.cuisine || "Restaurant"}
          </span>
          {restaurant.rating !== null && restaurant.rating !== undefined && (
            <span className="rounded-full bg-amber-50 px-3 py-2 text-amber-800">
              ★ {restaurant.rating.toFixed(1)} on Google
            </span>
          )}
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="rounded-full bg-orange-50 px-3 py-2 text-orange-800"
            >
              Call {restaurant.phone}
            </a>
          )}
          {restaurant.never_again && (
            <span className="rounded-full bg-rose-50 px-3 py-2 text-rose-700">
              Retired from the loop
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
              Google Maps hours
            </p>
            <p className="mt-2 text-sm font-black">
              {todayHours ?? "Today’s hours are not available"}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Hours are provided by Google Places and can change.
            </p>
          </div>
          {plannedHours && (
            <div
              className={`rounded-2xl p-4 ${plannedHours.isOpen ? "bg-emerald-50" : "bg-rose-50"}`}
            >
              <p
                className={`text-xs font-bold uppercase tracking-widest ${plannedHours.isOpen ? "text-emerald-700" : "text-rose-700"}`}
              >
                {plannedHours.known
                  ? plannedHours.isOpen
                    ? "Open for the planned meal"
                    : "Closed for the planned meal"
                  : "Planned-time hours unavailable"}
              </p>
              <p className="mt-2 text-sm font-black">{plannedHours.label}</p>
              <p className="mt-1 text-xs text-stone-600">
              {plannedAt ? dateLabel(plannedAt.toISOString(), timeZone) : ""}
              </p>
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Place information from <span translate="no">Google Maps</span>
        </p>
        <div className="mt-4 rounded-2xl bg-orange-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700">
            Lunch Loop facts
          </p>
          <p className="mt-2 text-sm text-stone-700">
            <strong className="text-stone-900">Wins:</strong>{" "}
            {restaurant.visit_count > 0
              ? `🏆 ${restaurant.visit_count} ${restaurant.visit_count === 1 ? "win" : "wins"}${restaurant.last_visited_at ? ` · last won ${dateLabel(restaurant.last_visited_at, timeZone)}` : ""}`
              : "No wins yet"}
          </p>
          <p className="mt-1 text-sm text-stone-700">
            <strong className="text-stone-900">Added:</strong>{" "}
            {addedBy ? `by ${addedBy}` : "by a crew member"}
            {restaurant.created_at
              ? ` on ${dateLabel(restaurant.created_at, timeZone)}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-stone-700">
            <strong className="text-stone-900">Shortlisted:</strong>{" "}
            {decisionFacts.appearances}{" "}
            {decisionFacts.appearances === 1 ? "time" : "times"} ·{" "}
            <strong className="text-stone-900">Vetoed:</strong>{" "}
            {decisionFacts.vetoes}{" "}
            {decisionFacts.vetoes === 1 ? "time" : "times"}
            {decisionFacts.vetoes
              ? ` by ${decisionFacts.vetoers} ${decisionFacts.vetoers === 1 ? "person" : "people"}`
              : ""}
          </p>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200">
          <iframe
            title={`Map of ${restaurant.name}`}
            src={embedUrl}
            className="h-56 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white"
        >
          Get directions ↗
        </a>
        {restaurant.hours?.length ? (
          <details className="mt-4 rounded-2xl border border-stone-200 p-4">
            <summary className="cursor-pointer font-black">
              Full weekly hours from Google Places
            </summary>
            <ul className="mt-3 space-y-1 text-sm text-stone-600">
              {restaurant.hours.map((hour) => (
                <li key={hour}>{hour}</li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
            No weekly hours are stored for this restaurant yet.
          </p>
        )}
      </section>
    </div>
  );
}
