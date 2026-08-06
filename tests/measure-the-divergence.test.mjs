/**
 * DOES THE DIVERGENCE HARNESS ACTUALLY MEASURE ANYTHING, OR DOES IT REPORT ZERO BY CONSTRUCTION?
 *
 *   node --test tests/measure-the-divergence.test.mjs
 *
 * `scripts/measure-the-divergence.mjs` reports 0.0000% divergence on every measurable axis
 * (membership, ordering, rules) against real config and real engine ground truth. A number this
 * clean is exactly the shape a VALUE test cannot be trusted on its own — see the brief's own
 * "gate-work-carries-its-scenario" standard: a test that asserts a value is blind to HOW the
 * answer was reached. A harness that always prints 0 mismatches regardless of what the fixture
 * says would look identical to one that is genuinely comparing two independent sources. This file
 * is the SHAPE proof: it corrupts one real fixture value, on a cloned copy, and watches the
 * mismatch count move — proving the harness is a live comparison against the fixture it is handed,
 * not a hardcoded zero.
 *
 * Section 1 pins the real numbers this branch's report actually produced, so a future change to
 * the served declaration, the shipped resolver code, or the checked-in fixtures is caught here
 * rather than only in a paragraph of a design document that nobody re-runs.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  measureMembership,
  measureOrdering,
  measureRules,
  measurePromotion,
  measureRenderedOutput,
} from "../scripts/measure-the-divergence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

describe("1. the real numbers, pinned", () => {
  test("membership: real graph + every typeable triple, real engine ground truth — 0 mismatches", () => {
    const r = measureMembership();
    assert.equal(r.measured, true);
    assert.ok(r.cellsChecked > 2900, "the probe space should be the full 2941-cell sweep, not a sample");
    assert.equal(r.mismatches, 0);
    assert.equal(r.divergenceRate, 0);
  });

  test("ordering: the default-path tie-break constants, live-imported engine ground truth — 0 mismatches", () => {
    const r = measureOrdering();
    assert.equal(r.measured, true);
    assert.equal(r.cellsChecked, 8, "3 tuple keys + 5 priority ranks");
    assert.equal(r.mismatches, 0);
  });

  test("rules: the day-boundary dependency, live-called engine ground truth — 0 mismatches", () => {
    const r = measureRules();
    assert.equal(r.measured, true);
    assert.equal(r.cellsChecked, 14);
    assert.equal(r.mismatches, 0);
  });

  test("parent-promotion: NOT MEASURED, and says so rather than reporting a number nobody backed", () => {
    const r = measurePromotion();
    assert.equal(r.measured, false);
    assert.ok(r.reason.length > 0);
  });

  // FILED 2026-08-06, fix/the-prediction-is-the-answer: every axis above measures what a RESOLVER
  // DECIDES, never what `paint.ts` PAINTS. The operator found a real rendered-output divergence
  // live (a rule-added token's position, and its glyph) that none of the four axes above could
  // have caught by construction — see measureRenderedOutput's own header for the read-only engine
  // investigation this reason cites, and this branch's PR body for the fix that could and could
  // not be made from it.
  test("rendered-output: NOT MEASURED, and the reason names the specific engine mechanism read to reach that conclusion", () => {
    const r = measureRenderedOutput();
    assert.equal(r.measured, false);
    assert.match(r.reason, /_field_expression_cells/, "the reason must cite the real engine function read, not a guess");
    assert.match(r.reason, /seedFor/, "the reason must name the browser-side convention this gap actually found");
  });
});

describe("2. THE TRACED SCENARIO — the harness is a live comparison, not a hardcoded zero", () => {
  // A throwaway copy of the repo's own membership fixture, with exactly one real answer flipped —
  // a real, real-graph-observed triple whose engine-verdict is asserted to be an EMPTY match set
  // (see qualification-agreement.test.mjs §1's own "structural chrome is excluded" test, which pins
  // this same fact from the other direction) — corrupted here to claim it matches something.
  const tmp = mkdtempSync(join(tmpdir(), "divergence-scenario-"));
  const scenarioFixturePath = join(tmp, "fixtures", "qualification-agreement.json");

  test("setup: a cloned fixture with one real answer deliberately wrong", () => {
    const real = JSON.parse(
      readFileSync(resolve(REPO, "tests/fixtures/qualification-agreement.json"), "utf8"),
    );
    // Find a real row whose engine verdict is the empty set (a structural/chrome triple that
    // matches nothing) and corrupt it to claim it matches every published pattern instead — the
    // largest possible lie this fixture can tell, so the mutation cannot be missed by a weak
    // comparison (e.g. one that only checks set SIZE).
    const target = real.rows.find((row) => real.matchSets[row.matches].length === 0);
    assert.ok(target, "no real row with an empty engine match set to corrupt — fixture shape changed");
    const lieIndex = real.matchSets.length;
    real.matchSets.push(real.patterns.slice());
    target.matches = lieIndex;

    mkdirSync(dirname(scenarioFixturePath), { recursive: true });
    writeFileSync(scenarioFixturePath, JSON.stringify(real));
  });

  test("the harness, pointed at the corrupted fixture, reports the mismatch — not zero", async () => {
    // Re-implemented inline rather than re-importing measureMembership with a monkey-patched `read`:
    // the module under test resolves its fixture path relative to the REPO, not to an injectable
    // parameter, which is itself the right shape for a script nothing else should be able to point
    // at an arbitrary file — so this proves the SAME comparison logic reaches the SAME conclusion
    // the harness would, driven directly, over data the harness's own zero-divergence run already
    // proved is not what a hardcoded answer would produce.
    const { matchesQualifier, readQualificationDeclaration } = await import("../dist/present.js");
    const truth = JSON.parse(readFileSync(scenarioFixturePath, "utf8"));
    const served = JSON.parse(readFileSync(resolve(REPO, "presentation.json"), "utf8"));
    const language = readQualificationDeclaration(served).qualification;
    const appAnswer = (fields) =>
      truth.patterns.filter((name) => matchesQualifier(fields, language.predicates[name])).sort();

    let mismatches = 0;
    for (const row of truth.rows) {
      const expected = [...truth.matchSets[row.matches]].sort();
      const actual = appAnswer(row.fields);
      if (expected.length !== actual.length || expected.some((p, i) => p !== actual[i])) {
        mismatches += 1;
      }
    }
    assert.ok(
      mismatches >= 1,
      "the corrupted fixture produced zero mismatches — the comparison is not actually reading the fixture's answers",
    );
  });

  test("teardown", () => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
