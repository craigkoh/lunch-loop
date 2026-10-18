import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/api";
import { searchPlaces } from "@/lib/google-places";
import { enforcePlacesUsage } from "@/lib/places-usage";
import { RouteAccessError, requireActiveGroupUser } from "@/lib/supabase/server";

const querySchema = z.object({ query: z.string().trim().min(2).max(120) });
const noStore = { "Cache-Control": "private, no-store" };

function errorResponse(message: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json({ error: message }, { status, headers: retryAfterSeconds ? { ...noStore, "Retry-After": String(retryAfterSeconds) } : noStore });
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { query } = querySchema.parse(await request.json());
    const user = await requireActiveGroupUser();
    const { data: profile, error: profileError } = await user.supabase
      .from("profiles")
      .select("active_group_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.active_group_id) {
      return errorResponse("Choose an active Lunch Loop before searching for places.", 403);
    }
    const limit = await enforcePlacesUsage(user.supabase, "place_search", profile.active_group_id);
    if (!limit.allowed) return errorResponse(limit.message ?? "Too many place searches. Please wait and try again.", 429, limit.retry_after_seconds);
    const { data: loop, error: loopError } = await user.supabase
      .from("groups")
      .select("home_label, home_lat, home_lng, search_radius_miles")
      .eq("id", profile.active_group_id)
      .single();
    if (loopError || !loop?.home_label || loop.home_lat === null || loop.home_lng === null || !loop.search_radius_miles) {
      return errorResponse("Your Lunch Loop owner needs to set its home area before searching for places.", 409);
    }
    return NextResponse.json({ places: await searchPlaces(query, {
      label: loop.home_label,
      lat: Number(loop.home_lat),
      lng: Number(loop.home_lng),
      radiusMiles: Number(loop.search_radius_miles),
    }) }, { headers: noStore });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return errorResponse("Enter a search of two to 120 characters.", 400);
    if (error instanceof RouteAccessError) return errorResponse(error.message, error.status);
    console.error("Google Places search failed", error);
    return errorResponse("Places search is temporarily unavailable. Please try again.", 502);
  }
}
