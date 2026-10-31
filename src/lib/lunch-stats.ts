/**
 * The Stats page numbers (build .76). Pure functions over data the app
 * already stores: finished rounds, their candidates and vetoes, and places.
 * Wins are counted from finished rounds only, so places' visit_count (which
 * can include older history) is used just for "waiting for a first win".
 */
export type StatsRound = {
  id: string;
  final_restaurant_id: string | null;
  started_at: string | null;
  winner_recorded_at: string | null;
  completed_at: string | null;
  scheduled_for: string | null;
};
export type StatsCandidate = { id: string; session_id: string; restaurant_id: string };
export type StatsVeto = { candidate_id: string };
export type StatsPlace = { id: string; name: string; cuisine?: string | null; never_again: boolean; visit_count: number };

export type Favorite = { id: string; name: string; wins: number; lastDate: string; everyDays: number | null };

export type LunchStats = {
  lunches: number;
  newPlaces: number;
  averageDecideMinutes: number | null;
  fastestDecideMinutes: number | null;
  currentStreakWeeks: number;
  bestStreakWeeks: number;
  streakStart: string | null;
  favorites: Favorite[];
  favoriteDay: { day: string; count: number } | null;
  favoriteCuisine: { cuisine: string; wins: number } | null;
  toughestWinner: { name: string; vetoes: number } | null;
  waitingForFirstWin: number;
};

const dayMs = 86_400_000;

function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const days = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) / dayMs;
  return { days, weekday: get("weekday") };
}

/** Monday-based week number (1970-01-01 was a Thursday). */
function weekOf(days: number) {
  return Math.floor((days + 3) / 7);
}

function lunchDate(round: StatsRound) {
  return round.scheduled_for ?? round.completed_at ?? round.winner_recorded_at ?? round.started_at;
}

export function lunchStats({
  rounds,
  candidates,
  vetoes,
  places,
  timeZone = "America/Chicago",
  now = new Date(),
}: {
  rounds: StatsRound[];
  candidates: StatsCandidate[];
  vetoes: StatsVeto[];
  places: StatsPlace[];
  timeZone?: string;
  now?: Date;
}): LunchStats {
  const placeById = new Map(places.map((place) => [place.id, place]));
  const dated = rounds
    .map((round) => ({ round, date: lunchDate(round) }))
    .filter((item): item is { round: StatsRound; date: string } => Boolean(item.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Wins per place, from finished rounds.
  const winsByPlace = new Map<string, string[]>();
  for (const { round, date } of dated) {
    if (!round.final_restaurant_id) continue;
    winsByPlace.set(round.final_restaurant_id, [...(winsByPlace.get(round.final_restaurant_id) ?? []), date]);
  }

  // Time to decide: round start to winner.
  const minutes = rounds
    .map((round) => (round.started_at && round.winner_recorded_at ? (new Date(round.winner_recorded_at).getTime() - new Date(round.started_at).getTime()) / 60_000 : null))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const averageDecideMinutes = minutes.length ? Math.round(minutes.reduce((total, value) => total + value, 0) / minutes.length) : null;
  const fastestDecideMinutes = minutes.length ? Math.round(Math.min(...minutes)) : null;

  // Weekly streaks.
  const weeks = [...new Set(dated.map(({ date }) => weekOf(localParts(date, timeZone).days)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = Number.NaN;
  let runStart = 0;
  let bestStart = 0;
  for (const week of weeks) {
    run = week === previous + 1 ? run + 1 : 1;
    if (run === 1) runStart = week;
    if (run > best) {
      best = run;
      bestStart = runStart;
    }
    previous = week;
  }
  const thisWeek = weekOf(localParts(now.toISOString(), timeZone).days);
  const lastWeek = weeks[weeks.length - 1];
  const current = lastWeek !== undefined && thisWeek - lastWeek <= 1 ? run : 0;
  const currentStart = current ? runStart : bestStart;
  const streakStartRound = dated.find(({ date }) => weekOf(localParts(date, timeZone).days) === currentStart);

  // Favorites you return to.
  const favorites: Favorite[] = [...winsByPlace.entries()]
    .filter(([, dates]) => dates.length > 1)
    .map(([id, dates]) => {
      const span = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / dayMs;
      return {
        id,
        name: placeById.get(id)?.name ?? "A past favorite",
        wins: dates.length,
        lastDate: dates[dates.length - 1],
        everyDays: dates.length > 1 ? Math.round(span / (dates.length - 1)) : null,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.lastDate.localeCompare(a.lastDate))
    .slice(0, 3);

  // Little facts.
  const dayCounts = new Map<string, number>();
  for (const { date } of dated) {
    const { weekday } = localParts(date, timeZone);
    dayCounts.set(weekday, (dayCounts.get(weekday) ?? 0) + 1);
  }
  const topDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const cuisineWins = new Map<string, number>();
  for (const [id, dates] of winsByPlace) {
    const cuisine = placeById.get(id)?.cuisine || "Restaurant";
    cuisineWins.set(cuisine, (cuisineWins.get(cuisine) ?? 0) + dates.length);
  }
  const topCuisine = [...cuisineWins.entries()].sort((a, b) => b[1] - a[1])[0];

  const candidateSession = new Map(candidates.map((candidate) => [candidate.id, candidate.session_id]));
  const vetoesBySession = new Map<string, number>();
  for (const veto of vetoes) {
    const session = candidateSession.get(veto.candidate_id);
    if (session) vetoesBySession.set(session, (vetoesBySession.get(session) ?? 0) + 1);
  }
  const survived = new Map<string, number>();
  for (const round of rounds) {
    if (!round.final_restaurant_id) continue;
    survived.set(round.final_restaurant_id, (survived.get(round.final_restaurant_id) ?? 0) + (vetoesBySession.get(round.id) ?? 0));
  }
  const tough = [...survived.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    lunches: rounds.length,
    newPlaces: winsByPlace.size,
    averageDecideMinutes,
    fastestDecideMinutes,
    currentStreakWeeks: current,
    bestStreakWeeks: best,
    streakStart: streakStartRound?.date ?? null,
    favorites,
    favoriteDay: topDay && topDay[1] > 1 ? { day: topDay[0], count: topDay[1] } : null,
    favoriteCuisine: topCuisine ? { cuisine: topCuisine[0], wins: topCuisine[1] } : null,
    toughestWinner: tough && tough[1] > 0 ? { name: placeById.get(tough[0])?.name ?? "A past winner", vetoes: tough[1] } : null,
    waitingForFirstWin: places.filter((place) => !place.never_again && place.visit_count === 0).length,
  };
}

/** 14 → "14 min", 75 → "1 hr 15 min", 3000 → "2 days". */
export function durationLabel(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${days} ${days === 1 ? "day" : "days"}`;
}
