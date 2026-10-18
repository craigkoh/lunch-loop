export type Restaurant = {
  id: string;
  google_place_id: string;
  name: string;
  address: string;
  phone?: string | null;
  hours?: string[] | null;
  rating?: number | null;
  cuisine?: string | null;
  lat?: number | null;
  lng?: number | null;
  visit_count: number;
  last_visited_at?: string | null;
  never_again: boolean;
  never_again_note?: string | null;
  added_by?: string | null;
  created_at?: string;
};

export type Member = {
  id: string;
  display_name: string;
  rotation_order: number;
  color: string;
};

export type LunchHistory = {
  id: string;
  date: string;
  suggester: string;
  restaurant: string;
  cuisine: string;
  vetoes: { member: string; restaurant: string; reason?: string }[];
};

export type PlaceSearchResult = Omit<Restaurant, "id" | "visit_count" | "never_again">;

export type AreaSuggestion = {
  label: string;
  address: string;
  lat: number;
  lng: number;
};
