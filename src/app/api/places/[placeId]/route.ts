import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/api";
import { getPlaceDetails } from "@/lib/google-places";
import { enforcePlacesUsage } from "@/lib/places-usage";
import { RouteAccessError, requireActiveGroupUser } from "@/lib/supabase/server";

const placeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,255}$/);
const noStore = { "Cache-Control": "private, no-store" };

function errorResponse(message: string, status: number, retryAfterSeconds?: number) {
  return NextResponse.json({ error: message }, { status, headers: retryAfterSeconds ? { ...noStore, "Retry-After": String(retryAfterSeconds) } : noStore });
}

export async function GET(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    requireSameOrigin(request);
    const { placeId } = await params;
    const validPlaceId = placeIdSchema.parse(placeId);
    const user = await requireActiveGroupUser();
    const { data: profile, error: profileError } = await user.supabase
      .from("profiles")
      .select("active_group_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.active_group_id) {
      return errorResponse("Choose an active Lunch Loop before viewing place details.", 403);
    }
    const limit = await enforcePlacesUsage(user.supabase, "place_detail", profile.active_group_id);
    if (!limit.allowed) return errorResponse(limit.message ?? "Too many place detail requests. Please wait and try again.", 429, limit.retry_after_seconds);
    return NextResponse.json({ place: await getPlaceDetails(validPlaceId) }, { headers: noStore });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("That place identifier is invalid.", 400);
    if (error instanceof RouteAccessError) return errorResponse(error.message, error.status);
    console.error("Google Places detail lookup failed", error);
    return errorResponse("Place details are temporarily unavailable. Please try again.", 502);
  }
}
