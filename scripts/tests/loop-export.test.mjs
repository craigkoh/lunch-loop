// Unit tests for the loop CSV export. Run with `npm test`.
// Transpiles src/lib/loop-export.ts with the project's TypeScript, so no
// extra test dependency is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const source = readFileSync(new URL("../../src/lib/loop-export.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const file = join(mkdtempSync(join(tmpdir(), "loop-export-")), "loop-export.mjs");
writeFileSync(file, output);
const { csvCell, googleMapsLink, loopExportCsv, loopExportFileName } = await import(file);

test("formula-looking cells are prefixed with an apostrophe", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "\"'+1\"");
  assert.equal(csvCell("-2"), "\"'-2\"");
  assert.equal(csvCell("@SUM(A1)"), "\"'@SUM(A1)\"");
  assert.equal(csvCell("\tcmd"), "\"'\tcmd\"");
  assert.equal(csvCell("\rcmd"), "\"'\rcmd\"");
});

test("plain cells, numbers, and blanks", () => {
  assert.equal(csvCell("Craig"), "Craig");
  assert.equal(csvCell(3), "3");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell("a,b"), "\"a,b\"");
  assert.equal(csvCell("say \"hi\""), "\"say \"\"hi\"\"\"");
  assert.equal(csvCell("line\nbreak"), "\"line\nbreak\"");
});

test("Google Maps link uses only the place_id", () => {
  assert.equal(
    googleMapsLink("ChIJ123"),
    "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJ123",
  );
  assert.equal(googleMapsLink(null), "");
});

test("full CSV has no Google place details and escapes names", () => {
  const csv = loopExportCsv(
    {
      loop_name: "=Nerd Dinner",
      time_zone: "America/Chicago",
      lunches: [
        {
          scheduled_for: "2026-10-21T17:00:00Z",
          completed_at: "2026-10-21T19:00:00Z",
          status: "completed",
          suggester: "@Seth",
          winner_ref: "P2",
          winner_google_place_id: "ChIJtwo",
          places_in_running: 3,
          veto_count: 2,
          vetoed_refs: "P1 P3",
        },
      ],
      places: [
        { ref: "P1", google_place_id: "ChIJone", wins: 0, last_won_at: null, vetoes: 1, never_again: false, added_by: "Craig", added_at: "2026-08-15T05:17:00Z" },
        { ref: "P2", google_place_id: "ChIJtwo", wins: 1, last_won_at: "2026-10-21T17:00:00Z", vetoes: 0, never_again: false, added_by: null, added_at: "2026-08-16T05:17:00Z" },
      ],
    },
    new Date("2026-10-30T12:00:00Z"),
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\"'=Nerd Dinner\""));
  assert.ok(csv.includes("\"'@Seth\""));
  assert.ok(csv.includes("2026-10-21 12:00"), "meal time is in the loop's time zone");
  assert.ok(csv.includes("query_place_id=ChIJtwo"));
  assert.ok(csv.includes("P1,https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJone,0,,1,No,Craig,2026-08-15"));
  assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(csv), "no email addresses");
});

test("file name is a safe slug", () => {
  assert.equal(loopExportFileName("Nerd Dinner!", new Date("2026-10-30T12:00:00Z")), "nerd-dinner-2026-10-30.csv");
  assert.equal(loopExportFileName("\"; rm -rf", new Date("2026-10-30T12:00:00Z")), "rm-rf-2026-10-30.csv");
  assert.equal(loopExportFileName("🍕", new Date("2026-10-30T12:00:00Z")), "lunch-loop-2026-10-30.csv");
});
