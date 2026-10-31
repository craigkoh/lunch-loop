/**
 * Loop CSV export. Only Lunch Loop's own data goes in the file: dates,
 * suggesters (display names, never emails), winners and vetoes as our own
 * place refs (P1, P2, ...), win counts, and a Google Maps link built from the
 * place_id. No Google place details (names, addresses, ratings, phone, hours)
 * are copied, per Google Maps Platform terms. See docs/INTEGRATIONS.md.
 */

export type LoopExportData = {
  loop_name: string | null;
  time_zone: string | null;
  lunches: {
    scheduled_for: string | null;
    completed_at: string | null;
    status: string;
    suggester: string;
    winner_ref: string | null;
    winner_google_place_id: string | null;
    places_in_running: number;
    veto_count: number;
    vetoed_refs: string | null;
  }[];
  places: {
    ref: string;
    google_place_id: string;
    wins: number;
    last_won_at: string | null;
    vetoes: number;
    never_again: boolean;
    added_by: string | null;
    added_at: string | null;
  }[];
};

/** A cell a spreadsheet could run as a formula starts with one of these. */
const formulaStart = /^[=+\-@\t\r]/;

/** Quote one CSV cell and neutralize spreadsheet formulas with a leading '. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (formulaStart.test(text)) text = `'${text}`;
  if (/[",\r\n']/.test(text) || text !== text.trim()) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

/** Google Maps link for a place, built only from its place_id. */
export function googleMapsLink(placeId: string | null | undefined) {
  if (!placeId) return "";
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}

function localDate(value: string | null, timeZone: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function safeTimeZone(timeZone: string | null) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone ?? "America/Chicago" });
    return timeZone ?? "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

export function loopExportCsv(data: LoopExportData, exportedAt = new Date()) {
  const timeZone = safeTimeZone(data.time_zone);
  const lines: string[] = [];
  lines.push(csvRow(["Lunch Loop export", data.loop_name ?? "Lunch Loop"]));
  lines.push(csvRow(["Exported", localDate(exportedAt.toISOString(), timeZone), timeZone]));
  lines.push(
    csvRow([
      "Note",
      "Places are listed by Lunch Loop place number (P1, P2, ...) with a Google Maps link. Open the link to see the place on Google Maps.",
    ]),
  );
  lines.push("");
  lines.push(csvRow(["LUNCHES"]));
  lines.push(
    csvRow([
      "Lunch #",
      "Meal date and time",
      "Status",
      "Suggested by",
      "Winner (place #)",
      "Winner on Google Maps",
      "Places in the running",
      "Vetoes",
      "Vetoed places (place #)",
    ]),
  );
  data.lunches.forEach((lunch, index) => {
    lines.push(
      csvRow([
        index + 1,
        localDate(lunch.scheduled_for ?? lunch.completed_at, timeZone),
        lunch.status === "completed" ? "Closed" : "Decided",
        lunch.suggester,
        lunch.winner_ref,
        googleMapsLink(lunch.winner_google_place_id),
        lunch.places_in_running,
        lunch.veto_count,
        lunch.vetoed_refs,
      ]),
    );
  });
  lines.push("");
  lines.push(csvRow(["PLACES"]));
  lines.push(
    csvRow(["Place #", "Google Maps link", "Wins", "Last won", "Times vetoed", "Never again", "Added by", "Added on"]),
  );
  for (const place of data.places) {
    lines.push(
      csvRow([
        place.ref,
        googleMapsLink(place.google_place_id),
        place.wins,
        localDate(place.last_won_at, timeZone).slice(0, 10),
        place.vetoes,
        place.never_again ? "Yes" : "No",
        place.added_by,
        localDate(place.added_at, timeZone).slice(0, 10),
      ]),
    );
  }
  // Leading BOM so Excel reads names with accents as UTF-8.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function loopExportFileName(loopName: string | null, now = new Date()) {
  const slug = (loopName ?? "lunch-loop")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "lunch-loop";
  return `${slug}-${now.toISOString().slice(0, 10)}.csv`;
}
