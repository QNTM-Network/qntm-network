/**
 * DOES THE BROWSER'S COMPOSED LINE EQUAL THE ENGINE'S OWN, BYTE FOR BYTE?
 *
 *   node --test tests/composition-agreement.test.mjs
 *
 * The second, independent half of the pinning `scripts/composition-agreement.py` performs — see
 * that script's own header. It ran the REAL Python renderer over fixture nodes, recorded each
 * fixture's own cell VALUES plus the engine's real full-line output, and REFUSED to write anything
 * if the declared order disagreed with that output. This file reads the two COMMITTED artefacts —
 * `tests/fixtures/composition-agreement.json` and the served `presentation.json` — and asserts they
 * still agree, so a change to EITHER file alone (the declared order edited without regenerating the
 * fixture, or `presentation.json` regenerated from a stale `compile-resolution.mjs`) is caught here
 * without re-running Python.
 *
 * WHAT THIS DOES NOT PROVE: that the ENGINE's live behaviour still matches the committed fixture —
 * that is a claim about `renderer.py`'s own wiring today, proven only by re-running
 * `scripts/composition-agreement.py` against a live monorepo checkout, unconfirmed by this file
 * (same posture `resolution-default-ordering-agreement.test.mjs` states for its own comparison).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfigResolutionDeclaration } from "../dist/present.js";
import { composeLine } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(resolve(HERE, path), "utf8"));

const SERVED = read("../presentation.json");
const FIXTURE = read("./fixtures/composition-agreement.json");
const RESOLUTION = readConfigResolutionDeclaration(SERVED).resolution;

describe("1. resolution.composition is present and shaped as this file expects", () => {
  test("the served declaration carries a composition table", () => {
    assert.ok(RESOLUTION, "presentation.json produced no resolution table at all");
    assert.ok(RESOLUTION.composition, "resolution.composition is absent or malformed");
  });

  test("positive control: the fixture carries more than a trivial single case", () => {
    assert.ok(FIXTURE.fixtures.length >= 6, "too few fixtures to prove an ORDER, not just presence");
  });
});

describe("2. every fixture recomposes byte-identical to the engine's own committed line", () => {
  for (const fixture of FIXTURE.fixtures) {
    test(`${fixture.id}: composeLine(...) === the real renderer's own output`, () => {
      const composed = composeLine(fixture.shape, fixture.cells, RESOLUTION.composition, fixture.depth);
      assert.equal(composed, fixture.expectedLine);
    });
  }
});

describe("3. the fixture set actually exercises every cell class — a comparison over an empty " +
  "or single-class fixture set would pass even if the ORDER were wrong", () => {
  test("at least one fixture carries a stamp", () => {
    assert.ok(FIXTURE.fixtures.some((f) => f.cells.stamp), "no fixture stamp — the ordering of " +
      "stamp relative to tags/markers/chrome was never actually exercised");
  });

  test("at least one fixture carries markers AND tags together (tests relative order, not just " +
    "presence)", () => {
    assert.ok(
      FIXTURE.fixtures.some((f) => f.cells.markers.length > 0 && f.cells.tags.length > 0),
      "no fixture carries both — a composer that swapped tags/markers order would still pass",
    );
  });

  test("at least one fixture carries chrome alongside tags and markers (tests chrome is LAST)", () => {
    assert.ok(
      FIXTURE.fixtures.some(
        (f) => f.cells.chrome.length > 0 && f.cells.tags.length > 0 && f.cells.markers.length > 0,
      ),
      "no fixture combines all three — chrome's position relative to the others was never tested",
    );
  });

  test("at least one fixture is nested (depth > 0)", () => {
    assert.ok(FIXTURE.fixtures.some((f) => f.depth > 0), "no nested fixture — indentation composition untested");
  });

  test("at least one fixture uses the plain_line HEAD (no checkbox glyph)", () => {
    assert.ok(FIXTURE.fixtures.some((f) => f.shape === "plain_line"), "plain_line HEAD never exercised");
  });

  test("at least one fixture has NO stamp (read-only), proving falsy cells are cleanly omitted, " +
    "not left as an empty slot", () => {
    assert.ok(FIXTURE.fixtures.some((f) => !f.cells.stamp), "no read-only fixture — omission untested");
  });
});
