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
      // Each fixture carries its OWN `composition` (bullet + titleStyles alongside heads/tail) —
      // most fixtures declare neither override and so carry the same "-" / [] the served
      // `RESOLUTION.composition` also answers today, but a fixture that DOES declare a form
      // (F7-F9, the capability proof) must compose against ITS OWN declared form, not the served
      // instance's default. `?? RESOLUTION.composition` is defence for an older, pre-form fixture
      // file that carried no per-fixture `composition` key at all.
      const composed = composeLine(
        fixture.shape,
        fixture.cells,
        fixture.composition ?? RESOLUTION.composition,
        fixture.depth,
      );
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

describe("4. FORM — composition's own optional bullet + title-style wrap, the CAPABILITY this " +
  "slice adds beyond cell ORDER", () => {
  test("positive control: at least one fixture declares a non-default bullet", () => {
    assert.ok(FIXTURE.fixtures.some((f) => f.composition?.bullet && f.composition.bullet !== "-"),
      "no fixture declares a bullet other than '-' — the declared-bullet capability is untested");
  });

  test("positive control: at least one fixture declares a title_styles wrap", () => {
    assert.ok(FIXTURE.fixtures.some((f) => f.composition?.titleStyles?.length),
      "no fixture declares title_styles — the declared-title-affix capability is untested");
  });

  test("positive control: at least one fixture declares MORE THAN ONE title style, proving " +
    "nesting order (bold outside strikethrough, per _apply_title_style's fixed emission order)", () => {
    assert.ok(FIXTURE.fixtures.some((f) => (f.composition?.titleStyles?.length ?? 0) > 1),
      "no fixture combines two styles — multi-style nesting is untested");
  });

  test("positive control: at least one fixture proves ABSENCE — default bullet, no title wrap — " +
    "byte-identical to what this repo emitted before FORM existed", () => {
    assert.ok(
      FIXTURE.fixtures.some((f) => f.composition?.bullet === "-" && !f.composition?.titleStyles?.length),
      "no fixture proves the absence case",
    );
  });

  test("THE OPERATOR'S OWN EXAMPLE — a declared italic title_styles composes '*Buy gift*'", () => {
    const fixture = FIXTURE.fixtures.find((f) => f.id === "declared_italic_title");
    assert.ok(fixture, "declared_italic_title fixture is missing");
    assert.ok(fixture.expectedLine.includes("*Buy gift*"), fixture.expectedLine);
    const composed = composeLine(fixture.shape, fixture.cells, fixture.composition, fixture.depth);
    assert.equal(composed, fixture.expectedLine);
  });
});
