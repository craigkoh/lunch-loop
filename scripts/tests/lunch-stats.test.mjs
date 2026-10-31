// Unit tests for the Stats page numbers. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function load(name) {
  const source = readFileSync(new URL(`../../src/lib/${name}.ts`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), `${name}-`)), `${name}.mjs`);
  writeFileSync(file, output);
  return import(file);
}
const { lunchStats, durationLabel } = await load("lunch-stats");

const places = [
  { id: "taco", name: "Taqueria", cuisine: "Mexican", never_again: false, visit_count: 3 },
  { id: "pho", name: "Pho 21", cuisine: "Vietnamese", never_again: false, visit_count: 1 },
  { id: "new", name: "Fresh Spot", cuisine: "Cafe", never_again: false, visit_count: 0 },
  { id: "bye", name: "Old Spot", cuisine: "Cafe", never_again: true, visit_count: 0 },
];
// Saturdays at 11:30 Central: Oct 3, 10, 17 (streak of 3), then Oct 31 after a gap.
const round = (id, day, winner, minutes) => ({
  id,
  final_restaurant_id: winner,
  started_at: `2026-10-${day}T15:00:00Z`,
  winner_recorded_at: minutes === null ? null : new Date(Date.parse(`2026-10-${day}T15:00:00Z`) + minutes * 60000).toISOString(),
  completed_at: `2026-10-${day}T18:00:00Z`,
  scheduled_for: `2026-10-${day}T16:30:00Z`,
});
const rounds = [round("r1", "03", "taco", 10), round("r2", "10", "pho", 30), round("r3", "17", "taco", 20), round("r4", "31", "taco", null)];
const candidates = [
  { id: "c1", session_id: "r1", restaurant_id: "pho" },
  { id: "c2", session_id: "r1", restaurant_id: "new" },
  { id: "c3", session_id: "r2", restaurant_id: "taco" },
  { id: "c4", session_id: "r3", restaurant_id: "pho" },
];
const vetoes = [{ candidate_id: "c1" }, { candidate_id: "c2" }, { candidate_id: "c3" }, { candidate_id: "c4" }];

test("counts lunches, new places, and time to decide", () => {
  const s = lunchStats({ rounds, candidates, vetoes, places, now: new Date("2026-10-31T20:00:00Z") });
  assert.equal(s.lunches, 4);
  assert.equal(s.newPlaces, 2);
  assert.equal(s.averageDecideMinutes, 20);
  assert.equal(s.fastestDecideMinutes, 10);
});

test("weekly streaks: best run and the current one", () => {
  const s = lunchStats({ rounds, candidates, vetoes, places, now: new Date("2026-10-31T20:00:00Z") });
  assert.equal(s.bestStreakWeeks, 3);
  assert.equal(s.currentStreakWeeks, 1);
  const later = lunchStats({ rounds, candidates, vetoes, places, now: new Date("2026-11-20T20:00:00Z") });
  assert.equal(later.currentStreakWeeks, 0);
});

test("favorites, facts, and first-win count", () => {
  const s = lunchStats({ rounds, candidates, vetoes, places, now: new Date("2026-10-31T20:00:00Z") });
  assert.equal(s.favorites.length, 1);
  assert.equal(s.favorites[0].name, "Taqueria");
  assert.equal(s.favorites[0].wins, 3);
  assert.equal(s.favorites[0].everyDays, 14);
  assert.deepEqual(s.favoriteDay, { day: "Saturday", count: 4 });
  assert.deepEqual(s.favoriteCuisine, { cuisine: "Mexican", wins: 3 });
  assert.deepEqual(s.toughestWinner, { name: "Taqueria", vetoes: 3 });
  assert.equal(s.waitingForFirstWin, 1);
});

test("empty data stays calm", () => {
  const s = lunchStats({ rounds: [], candidates: [], vetoes: [], places: [] });
  assert.equal(s.lunches, 0);
  assert.equal(s.averageDecideMinutes, null);
  assert.equal(s.bestStreakWeeks, 0);
  assert.equal(s.favoriteDay, null);
  assert.equal(s.toughestWinner, null);
});

test("duration labels", () => {
  assert.equal(durationLabel(14), "14 min");
  assert.equal(durationLabel(75), "1 hr 15 min");
  assert.equal(durationLabel(120), "2 hr");
  assert.equal(durationLabel(3000), "2 days");
});
