// Unit tests for milestone cards, feedback status steps, and initials. Run with `npm test`.
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
const { computeMilestones, lastAnniversary } = await load("milestones");
const { feedbackStep, feedbackStatusLabel } = await load("feedback-status");
const { initialsFor, firstNameOf } = await load("initials");

const now = Date.parse("2026-10-30T18:00:00Z");
const day = 86_400_000;
const iso = (offsetDays) => new Date(now + offsetDays * day).toISOString();
const base = {
  group_created_at: iso(-200),
  completed_count: 9,
  nth_lunch_at: {},
  latest: { session_id: "s9", at: iso(-1), restaurant_id: "r1", restaurant_name: "Pho 21", restaurant_wins: 3 },
  members: [
    { user_id: "u1", name: "Craig", joined_at: iso(-200), first_lunch_session_id: "s1" },
    { user_id: "u2", name: "Seth", joined_at: iso(-200), first_lunch_session_id: "s1" },
  ],
  dismissed: [],
};

test("no milestones on an ordinary day", () => {
  assert.deepEqual(computeMilestones(base, "u1", now), []);
  assert.deepEqual(computeMilestones(null, "u1", now), []);
});

test("10th lunch shows for two weeks, then goes away", () => {
  const facts = { ...base, completed_count: 10, nth_lunch_at: { 10: iso(-3) } };
  assert.equal(computeMilestones(facts, "u1", now)[0].key, "lunches:10");
  assert.equal(computeMilestones(facts, "u1", now)[0].title, "10th lunch together!");
  const old = { ...base, completed_count: 12, nth_lunch_at: { 10: iso(-20) } };
  assert.deepEqual(computeMilestones(old, "u1", now), []);
});

test("only the biggest recent lunch count shows", () => {
  const facts = { ...base, completed_count: 25, nth_lunch_at: { 10: iso(-5), 25: iso(-1) } };
  const keys = computeMilestones(facts, "u1", now).map((m) => m.key);
  assert.deepEqual(keys, ["lunches:25"]);
});

test("dismissed milestones stay hidden", () => {
  const facts = { ...base, completed_count: 10, nth_lunch_at: { 10: iso(-3) }, dismissed: ["lunches:10"] };
  assert.deepEqual(computeMilestones(facts, "u1", now), []);
});

test("one-year anniversary", () => {
  const facts = { ...base, group_created_at: "2025-10-25T15:00:00Z" };
  const [first] = computeMilestones(facts, "u1", now);
  assert.equal(first.key, "anniversary:1");
  assert.equal(first.title, "One year of Lunch Loop!");
  assert.equal(lastAnniversary("2026-01-01T00:00:00Z", now), null);
  assert.equal(lastAnniversary("2024-10-29T00:00:00Z", now).years, 2);
});

test("a place's first win", () => {
  const facts = { ...base, latest: { ...base.latest, restaurant_wins: 1, restaurant_name: "Gerst Haus", restaurant_id: "r9" } };
  const [first] = computeMilestones(facts, "u1", now);
  assert.equal(first.key, "first-win:r9");
  assert.match(first.title, /Gerst Haus won for the first time/);
  // The loop's very first lunch is not a "first win" moment.
  assert.deepEqual(computeMilestones({ ...facts, completed_count: 1 }, "u1", now), []);
});

test("a new member's first lunch", () => {
  const facts = { ...base, members: [...base.members, { user_id: "u3", name: "Dana", joined_at: iso(-10), first_lunch_session_id: "s9" }] };
  const milestones = computeMilestones(facts, "u1", now);
  assert.equal(milestones[0].key, "first-lunch:u3");
  assert.equal(milestones[0].title, "Dana’s first lunch with the crew!");
  assert.equal(computeMilestones(facts, "u3", now)[0].title, "Your first lunch with the crew!");
});

test("feedback status maps onto the four-step line", () => {
  assert.equal(feedbackStep("new"), 1);
  assert.equal(feedbackStep("triaged"), 2);
  assert.equal(feedbackStep("planned"), 3);
  assert.equal(feedbackStep("in_progress"), 3);
  assert.equal(feedbackStep("shipped"), 4);
  assert.equal(feedbackStep("declined"), 0);
  assert.equal(feedbackStatusLabel("shipped"), "Live");
  assert.equal(feedbackStatusLabel("triaged"), "Looking at it");
  assert.equal(feedbackStatusLabel("duplicate"), "Already on the list");
});

test("initials, never emoji", () => {
  assert.equal(initialsFor("Craig Kohler"), "CK");
  assert.equal(initialsFor("seth"), "S");
  assert.equal(initialsFor("🍕 Pizza Pete"), "PP");
  assert.equal(initialsFor(""), "?");
  assert.equal(initialsFor("Mary Ann van Dyke"), "MD");
  assert.equal(firstNameOf("Craig Kohler"), "Craig");
});
