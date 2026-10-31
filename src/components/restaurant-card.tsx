import type { Restaurant } from "@/lib/types";
import { todaysHours } from "@/lib/location-hours";
import { winsLine } from "@/lib/wins";

/**
 * A place row: the name plus one short line ("Mexican · 🏆 2 wins").
 * Address, map, history, and who added it live in the details sheet.
 */
export function RestaurantCard({
  restaurant,
  action,
  onOpen,
  timeZone,
}: {
  restaurant: Restaurant;
  action?: React.ReactNode;
  onOpen?: (restaurant: Restaurant) => void;
  addedBy?: string | null;
  timeZone?: string;
}) {
  const todayHours = todaysHours(restaurant.hours, new Date(), timeZone);
  const line = [restaurant.cuisine || "Restaurant", winsLine(restaurant.visit_count), todayHours]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--ll-radius-lg)] bg-surface px-5 py-4 shadow-[var(--ll-shadow-card)]">
      <button
        type="button"
        onClick={() => onOpen?.(restaurant)}
        disabled={!onOpen}
        className={`flex min-w-[12rem] flex-1 basis-0 items-center gap-3 text-left ${onOpen ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" : "cursor-default"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{restaurant.name}</span>
            {restaurant.never_again && (
              <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">Never again</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted">{line}</span>
        </span>
        {onOpen && <span className="text-stone-300" aria-hidden="true">›</span>}
      </button>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </article>
  );
}
