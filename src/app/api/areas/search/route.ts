import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/api";
import { searchAreaSuggestions } from "@/lib/google-places";
import { enforcePlacesUsage } from "@/lib/places-usage";
import { RouteAccessError, requireAuthenticatedSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ query: z.string().trim().min(2).max(120) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { query } = bodySchema.parse(await request.json());
    const { supabase } = await requireAuthenticatedSupabase();
    const limit = await enforcePlacesUsage(supabase, "area_search");
    if (!limit.allowed) {
      return NextResponse.json(
        { error: limit.message ?? "Too many area searches. Please wait and try again." },
        { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(limit.retry_after_seconds) } },
      );
    }
    return NextResponse.json(
      { areas: await searchAreaSuggestions(query) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Enter at least two characters to search for a city or area." }, { status: 400 });
    }
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Google Places area search failed", error);
    return NextResponse.json({ error: "Area search is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
