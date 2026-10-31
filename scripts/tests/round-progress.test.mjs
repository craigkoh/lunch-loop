// Unit tests for the round progress line positions. Run with `npm test`.
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
const { roundPositions, waitingOnText } = await load("round-progress");
const crew = ["ck", "sb", "dl", "mo"];

test("while picking, everyone waits and the suggester leads", () => {
  assert.deepEqual(roundPositions({ memberIds: crew, suggesterId: "sb", vetoerIds: [], picksMade: false, decided: false }), { done: [], waiting: ["sb", "ck", "dl", "mo"], share: 0 });
});

test("the suggester sits at the finish once picks are in", () => {
  const p = roundPositions({ memberIds: crew, suggesterId: "sb", vetoerIds: [], picksMade: true, decided: false });
  assert.deepEqual(p.done, ["sb"]);
  assert.deepEqual(p.waiting, ["ck", "dl", "mo"]);
  assert.equal(p.share, 0.25);
});

test("vetoers move to the finish in crew order", () => {
  const p = roundPositions({ memberIds: crew, suggesterId: "sb", vetoerIds: ["mo", "ck"], picksMade: true, decided: false });
  assert.deepEqual(p.done, ["sb", "ck", "mo"]);
  assert.deepEqual(p.waiting, ["dl"]);
  assert.equal(p.share, 0.75);
});

test("when decided, the whole crew is at the finish", () => {
  const p = roundPositions({ memberIds: crew, suggesterId: "sb", vetoerIds: ["ck"], picksMade: true, decided: true });
  assert.deepEqual(p.done, ["sb", "ck", "dl", "mo"]);
  assert.deepEqual(p.waiting, []);
  assert.equal(p.share, 1);
});

test("vetoes from people no longer in the crew are ignored, and a missing suggester is fine", () => {
  const p = roundPositions({ memberIds: crew, suggesterId: "gone", vetoerIds: ["ghost", "dl"], picksMade: true, decided: false });
  assert.deepEqual(p.done, ["dl"]);
  assert.deepEqual(p.waiting, ["ck", "sb", "mo"]);
  assert.equal(p.share, 0.25);
  assert.deepEqual(roundPositions({ memberIds: [], suggesterId: null, vetoerIds: [], picksMade: false, decided: false }), { done: [], waiting: [], share: 0 });
});

test("waiting names read naturally", () => {
  assert.equal(waitingOnText(["you"]), "you");
  assert.equal(waitingOnText(["you", "Dana"]), "you and Dana");
  assert.equal(waitingOnText(["Dana", "Mike", "you"]), "Dana, Mike, and you");
});
