import type { Restaurant } from "@/lib/types";
import { todaysHours } from "@/lib/location-hours";

function shortDate(value?: string | null, timeZone?: string) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(value))
    : null;
}

export function RestaurantCard({
  restaurant,
  action,
  onOpen,
  addedBy,
  timeZone,
}: {
  restaurant: Restaurant;
  action?: React.ReactNode;
  onOpen?: (restaurant: Restaurant) => void;
  addedBy?: string | null;
  timeZone?: string;
}) {
  const todayHours = todaysHours(restaurant.hours, new Date(), timeZone);
  return (
    <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => onOpen?.(restaurant)}
        disabled={!onOpen}
        className={`w-full text-left ${onOpen ? "cursor-pointer transition hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-orange-300" : "cursor-default"}`}
      >
        <div className="flex gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-xl">
            {restaurant.cuisine === "Japanese"
              ? "🍣"
              : restaurant.cuisine === "Mexican"
                ? "🌮"
                : restaurant.cuisine === "Pizza"
                  ? "🍕"
                  : "🥪"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-extrabold leading-5">{restaurant.name}</h3>
              {restaurant.rating && (
                <span className="shrink-0 text-sm font-bold text-amber-700">
                  ★ {restaurant.rating.toFixed(1)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-stone-500">{restaurant.address}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
              <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-600">
                {restaurant.cuisine}
              </span>
              <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">
                {restaurant.visit_count > 0
                  ? `🏆 ${restaurant.visit_count} ${restaurant.visit_count === 1 ? "win" : "wins"}`
                  : "No wins yet"}
              </span>
              {todayHours && (
                <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-600">
                  {todayHours}
                </span>
              )}
              {restaurant.never_again && (
                <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                  Never again
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-1 border-t border-stone-100 pt-3 text-xs text-stone-500 sm:grid-cols-2">
          <p>
            {restaurant.last_visited_at
              ? `Last won ${shortDate(restaurant.last_visited_at, timeZone)}`
              : "No wins yet"}
          </p>
          <p>
            Added{addedBy ? ` by ${addedBy}` : ""}{" "}
            {shortDate(restaurant.created_at, timeZone) ?? "previously"}
          </p>
        </div>
        <p className="mt-2 text-[11px] font-normal text-stone-400">
          Place information from <span translate="no">Google Maps</span>
        </p>
        {onOpen && (
          <p className="mt-3 text-xs font-bold text-orange-700">
            View details, map, and directions →
          </p>
        )}
      </button>
      {action && (
        <div className="mt-4 border-t border-stone-100 pt-3">{action}</div>
      )}
    </article>
  );
}
