import { z } from "zod";
import type { AreaSuggestion, PlaceSearchResult } from "./types";

const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.regularOpeningHours,places.rating,places.types,places.location";
const AREA_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location";

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string(),
  nationalPhoneNumber: z.string().optional(),
  regularOpeningHours: z.object({ weekdayDescriptions: z.array(z.string()).optional() }).optional(),
  rating: z.number().optional(),
  types: z.array(z.string()).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

function cuisineFromTypes(types: string[] = []) {
  return types.find((type) => type.endsWith("_restaurant"))?.replace(/_restaurant$/, "").replaceAll("_", " ") || "Restaurant";
}

function normalizePlace(place: z.infer<typeof placeSchema>): PlaceSearchResult {
  return {
    google_place_id: place.id,
    name: place.displayName.text,
    address: place.formattedAddress,
    phone: place.nationalPhoneNumber,
    hours: place.regularOpeningHours?.weekdayDescriptions,
    rating: place.rating,
    cuisine: cuisineFromTypes(place.types),
    lat: place.location?.latitude,
    lng: place.location?.longitude,
  };
}

function milesBetween(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = Math.PI / 180;
  const latitudeDelta = (latitudeB - latitudeA) * radians;
  const longitudeDelta = (longitudeB - longitudeA) * radians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA * radians) *
      Math.cos(latitudeB * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3_958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type PlaceSearchArea = {
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
};

function rectangleForArea(area: PlaceSearchArea) {
  const latitudeDelta = area.radiusMiles / 69;
  const longitudeDelta = area.radiusMiles / (69 * Math.max(Math.cos((area.lat * Math.PI) / 180), 0.01));
  return {
    low: { latitude: area.lat - latitudeDelta, longitude: area.lng - longitudeDelta },
    high: { latitude: area.lat + latitudeDelta, longitude: area.lng + longitudeDelta },
  };
}

function googleKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Google Places is not configured. Add GOOGLE_PLACES_API_KEY to .env.local.");
  return key;
}

async function throwGoogleError(response: Response, action: "search" | "load details"): Promise<never> {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  const detail = payload?.error?.message;
  console.error(`Google Places ${action} failed`, { status: response.status, detail });
  throw new Error(detail ? `Google Places could not ${action}: ${detail}` : `Google Places could not ${action} (${response.status}).`);
}

export async function searchPlaces(
  query: string,
  area: PlaceSearchArea,
): Promise<PlaceSearchResult[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: `${query} near ${area.label}`,
      locationRestriction: { rectangle: rectangleForArea(area) },
      includedType: "restaurant",
      strictTypeFiltering: false,
      maxResultCount: 12,
    }),
    cache: "no-store",
  });
  if (!response.ok) await throwGoogleError(response, "search");
  const payload = z.object({ places: z.array(placeSchema).optional() }).parse(await response.json());
  return (payload.places ?? [])
    .map(normalizePlace)
    .filter(
      (place) =>
        place.lat == null ||
        place.lng == null ||
        milesBetween(area.lat, area.lng, place.lat, place.lng) <= area.radiusMiles,
    );
}

export async function searchAreaSuggestions(query: string): Promise<AreaSuggestion[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": AREA_FIELD_MASK },
    body: JSON.stringify({ textQuery: query, maxResultCount: 6 }),
    cache: "no-store",
  });
  if (!response.ok) await throwGoogleError(response, "search");
  const payload = z.object({ places: z.array(placeSchema).optional() }).parse(await response.json());
  return (payload.places ?? [])
    .filter((place) => Boolean(place.location))
    .map((place) => ({
      label: place.displayName.text,
      address: place.formattedAddress,
      lat: place.location!.latitude,
      lng: place.location!.longitude,
    }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceSearchResult> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": FIELD_MASK.replaceAll("places.", "") },
    cache: "no-store",
  });
  if (!response.ok) await throwGoogleError(response, "load details");
  return normalizePlace(placeSchema.parse(await response.json()));
}
