import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlacesUsageAction = "place_search" | "place_detail" | "area_search";

type LimitResult = {
  allowed: boolean;
  retry_after_seconds: number;
  message: string | null;
};

/**
 * Durable quota check backed by Postgres. Unlike an in-memory limiter this is
 * shared by every Vercel instance and records only requests we allow to reach
 * Google Places.
 */
export async function enforcePlacesUsage(
  supabase: SupabaseClient,
  action: PlacesUsageAction,
  groupId?: string | null,
) {
  const { data, error } = await supabase
    .rpc("enforce_lunch_loop_places_limit", {
      requested_action: action,
      target_group: groupId ?? null,
    })
    .single<LimitResult>();
  if (error) throw error;
  return data;
}
