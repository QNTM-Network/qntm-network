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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CHECKBOX DECISION — the published literal against the live contract's own answers
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS COMPARISON AND NOT `presentation.json`'s ──
//
// `resolution.renderCheckbox` is a hand-written literal in `compile-resolution.mjs`, the same
// posture `ENGINE_LITERAL_TAG_ORDER` takes. The contract's own header
// (`render/contracts/render_checkbox.yaml`) says what a hand copy is worth alone:
// `config/rendering/checkbox.yaml` was exactly such a copy, "kept in sync by nothing", and when the
// 2026-06-24 fix dropped the `node.type == "task"` guard from every row it did not follow. A done
// OUTCOME then matched no row, took the fallback, rendered `[ ]` while the model held status=done,
// and the next re-ingest silently RE-OPENED it — qntm:66/837/903, every four to five days.
//
// So the literal is compared against the GENERATOR's own export rather than the served file. The
// fixture side was produced by dispatching real nodes through the real `_checkbox_dispatcher()`
// (see `render_checkbox_pin` in the Python script), so this asserts the browser's copy equals what
// the engine ACTUALLY ANSWERED — and it runs on every PR, with no monorepo, because both artefacts
// are committed. `presentation.json` is not the subject: it has not been regenerated (that is
// blocked on the seed question), and waiting for it would leave the copy unchecked in the meantime.

import { ENGINE_LITERAL_RENDER_CHECKBOX } from "../scripts/compile-resolution.mjs";

describe("the checkbox glyph — a decision, pinned against the engine's own dispatcher", () => {
  test("the fixture carries the pin at all — otherwise everything below is vacuous", () => {
    assert.ok(FIXTURE.renderCheckbox, "the fixture has no renderCheckbox pin; regenerate it");
    assert.ok(Array.isArray(FIXTURE.renderCheckbox.rows), "the pin carries no rows");
    assert.ok(FIXTURE.renderCheckbox.rows.length >= 6, "the pin covers fewer statuses than the contract declares");
  });

  test("THE PIN: the published literal is exactly what the real dispatcher answered", () => {
    // deepEqual, not a spot-check on one glyph: a row REMOVED, REORDERED or RETARGETED must all be
    // caught, and order is meaning in a first-match-wins table.
    assert.deepEqual(
      JSON.parse(JSON.stringify(ENGINE_LITERAL_RENDER_CHECKBOX)),
      FIXTURE.renderCheckbox,
      "compile-resolution.mjs's checkbox literal has drifted from the engine contract — re-run " +
        "'apps/qntm-md/.venv/bin/python scripts/composition-agreement.py' and reconcile the literal " +
        "TO the contract, never the other way round",
    );
  });

  test("the fallback is a real answer, not an absent one", () => {
    // The property a value map cannot hold. A status-less node renders this BY RULE.
    assert.equal(FIXTURE.renderCheckbox.fallback, "[ ]");
    assert.ok(
      !FIXTURE.renderCheckbox.rows.some((r) => r.when.equals === undefined || r.when.equals === null),
      "a row matching an absent value would make the fallback unreachable",
    );
  });

  test("every row decides a DISTINCT glyph — six rows collapsing to one would prove nothing", () => {
    const glyphs = FIXTURE.renderCheckbox.rows.map((r) => r.then);
    assert.equal(new Set(glyphs).size, glyphs.length, `the pin has duplicate glyphs: ${glyphs.join(" ")}`);
  });

  test("EVALUATED IN ORDER, first match wins — the shape, driven rather than described", () => {
    // A reader must walk `rows` and stop at the first match. This drives that walk over the real
    // published table so the contract's shape is exercised, not merely asserted about.
    const decide = (fields) => {
      for (const row of ENGINE_LITERAL_RENDER_CHECKBOX.rows) {
        if (fields[row.when.field] === row.when.equals) return row.then;
      }
      return ENGINE_LITERAL_RENDER_CHECKBOX.fallback;
    };
    assert.equal(decide({ status: "done" }), "[x]");
    assert.equal(decide({ status: "open" }), "[ ]");
    assert.equal(decide({ status: "cancelled" }), "[-]");
    // THE CASE THAT COST THE OPERATOR DATA. A done node of ANY type takes the done row — the rows
    // carry no `node.type` condition, and restoring one is what rendered `[ ]` over status=done.
    assert.ok(
      !ENGINE_LITERAL_RENDER_CHECKBOX.rows.some((r) => r.when.field !== "status"),
      "a row now conditions on something other than status — a done node of some type may take " +
        "the fallback and render an open box, which is the re-opening defect of 2026-06-24",
    );
    // AND THE FALLBACK IS REACHED, not merely declared.
    assert.equal(decide({}), "[ ]");
    assert.equal(decide({ status: "not-a-real-status" }), "[ ]");
  });

  test("the reader accepts the published table and refuses a half-readable one", () => {
    const { resolution, problems } = readConfigResolutionDeclaration({
      resolution: { ...SERVED.resolution, renderCheckbox: ENGINE_LITERAL_RENDER_CHECKBOX, renderCheckboxSource: "engine-literal" },
    });
    assert.deepEqual(problems, [], "the reader objected to the generator's own checkbox table");
    assert.deepEqual(resolution.renderCheckbox.rows.map((r) => r.then), ["[ ]", "[x]", "[/]", "[-]", "[~]", "[>]"]);

    // ONE BAD ROW REFUSES THE WHOLE TABLE. Dropping row 2 and keeping the rest would silently
    // promote every later row, so a node that should have matched the dropped one takes the next
    // row's glyph instead of the fallback — a wrong answer where refusing gives none.
    const broken = { rows: [...ENGINE_LITERAL_RENDER_CHECKBOX.rows], fallback: "[ ]" };
    broken.rows[1] = { when: { field: "status" }, then: "[x]" };
    const bad = readConfigResolutionDeclaration({ resolution: { ...SERVED.resolution, renderCheckbox: broken } });
    assert.equal(bad.resolution.renderCheckbox, undefined, "a malformed row left a partial table readable");
    assert.ok(bad.problems.some((p) => p.includes("renderCheckbox.rows[1]")), bad.problems.join("; "));
  });

  test("`spelling` no longer offers the checkbox glyph as a field spelling", () => {
    // THE TRAP, ASSERTED CLOSED. `spelling.fieldTokens.status` used to return the six glyphs and
    // would have been the obvious thing to reach for. There is now no table it can come from: the
    // split is on the engine's own `tag.startswith("#")` filter, and `status` is in neither half.
    const { resolution } = readConfigResolutionDeclaration({
      resolution: { ...SERVED.resolution, spelling: { typeTokens: { task: "#task" }, fieldTags: {}, fieldMarkerValues: {}, fieldMarkers: {} } },
    });
    assert.equal(resolution.spelling.fieldTokens, undefined, "the conflated table is back");
    assert.equal(resolution.spelling.fieldTags.status, undefined);
    assert.equal(resolution.spelling.fieldMarkerValues.status, undefined);
  });
});
