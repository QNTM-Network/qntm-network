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
      // `edgeTags` IS REQUIRED, like every other table on `spelling` — a hand-built literal here
      // has to carry it. That is deliberate rather than incidental: `readSpelling` refuses the
      // WHOLE fact when any of its tables is missing, because a composer holding a partial spelling
      // prints lines that are wrong in ways nothing flags. A served declaration predating a table
      // loses the spelling table loudly instead of quietly composing without one cell.
      resolution: {
        ...SERVED.resolution,
        spelling: { typeTokens: { task: "#task" }, edgeTags: {}, fieldTags: {}, fieldMarkerValues: {}, fieldMarkers: {} },
      },
    });
    assert.equal(resolution.spelling.fieldTokens, undefined, "the conflated table is back");
    assert.equal(resolution.spelling.fieldTags.status, undefined);
    assert.equal(resolution.spelling.fieldMarkerValues.status, undefined);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE OTHER TWO CANONICAL ORDERS — pinned against the same dispatcher factories
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `composition.tail` names three cell families that can carry MORE THAN ONE cell — `tags`,
// `markers`, `chrome` — and each has its own canonical order contract. `tagOrder` shipped alone on
// 2026-08-07, so a composer could order one of the three and had to invent the other two. Inventing
// an order is not a smaller failure than inventing a glyph; it is the same failure one cell along.
//
// PINNED BY THE FACTORY, NOT THE FILE, and here that matters more than it did for the checkbox:
// these contracts are being MOVED out of the engine's source tree into config. `renderer.py`'s
// `_engine_render_dispatcher(table_id)` resolves the path ITSELF, so asking the factory survives
// the move and naming a path would not.

import {
  ENGINE_LITERAL_TAG_ORDER,
  ENGINE_LITERAL_MARKER_ORDER,
  ENGINE_LITERAL_EDGE_TAG_ORDER,
} from "../scripts/compile-resolution.mjs";

describe("the three canonical cell orders — published literals against the real dispatchers", () => {
  const PINNED = FIXTURE.canonicalOrders;

  test("the fixture carries all three pins — otherwise everything below is vacuous", () => {
    assert.ok(PINNED, "the fixture has no canonicalOrders pin; regenerate it");
    for (const key of ["tagOrder", "markerOrder", "edgeTagOrder"]) {
      assert.ok(PINNED[key]?.canonicalOrder?.length > 0, `${key} pinned an empty order`);
    }
  });

  test("THE PIN: each published literal is exactly what its dispatcher ranked", () => {
    const published = {
      tagOrder: ENGINE_LITERAL_TAG_ORDER,
      markerOrder: ENGINE_LITERAL_MARKER_ORDER,
      edgeTagOrder: ENGINE_LITERAL_EDGE_TAG_ORDER,
    };
    for (const [key, literal] of Object.entries(published)) {
      assert.deepEqual(
        JSON.parse(JSON.stringify(literal)),
        PINNED[key],
        `compile-resolution.mjs's ${key} literal has drifted from the engine contract — re-run ` +
          "'apps/qntm-md/.venv/bin/python scripts/composition-agreement.py' and reconcile the " +
          "literal TO the contract, never the other way round",
      );
    }
  });

  test("the three are DISTINCT — one factory answering every table would make three pins one", () => {
    const orders = ["tagOrder", "markerOrder", "edgeTagOrder"].map((k) => JSON.stringify(PINNED[k].canonicalOrder));
    assert.equal(new Set(orders).size, 3, `two canonical orders are identical: ${orders.join(" | ")}`);
  });

  test("markers are ordered by GLYPH and edge tags by TAG — different alphabets, not a copy", () => {
    // A cheap shape check that would catch the marker order being accidentally seeded from a tag
    // contract: no marker key may start with `#`, and every edge-tag key must.
    for (const token of PINNED.markerOrder.canonicalOrder) {
      assert.ok(!token.startsWith("#"), `markerOrder ranks '${token}', which is a tag, not a marker glyph`);
    }
    for (const token of PINNED.edgeTagOrder.canonicalOrder) {
      assert.ok(token.startsWith("#"), `edgeTagOrder ranks '${token}', which is not a tag`);
    }
  });

  test("all three declare append_stable, so an UNRANKED cell trails rather than vanishing", () => {
    // The policy is half the answer. `append_stable` means a glyph the contract does not rank still
    // prints, after the ranked ones, in its own arrival order — a composer that dropped it instead
    // would silently lose a cell the engine emits.
    for (const key of ["tagOrder", "markerOrder", "edgeTagOrder"]) {
      assert.equal(PINNED[key].unrankedPolicy, "append_stable", `${key} changed its unranked policy`);
    }
  });

  test("the reader accepts all three, and names the RIGHT key when one is malformed", () => {
    const withOrders = {
      ...SERVED.resolution,
      markerOrder: ENGINE_LITERAL_MARKER_ORDER,
      markerOrderSource: "engine-literal",
      edgeTagOrder: ENGINE_LITERAL_EDGE_TAG_ORDER,
      edgeTagOrderSource: "engine-literal",
    };
    const good = readConfigResolutionDeclaration({ resolution: withOrders });
    assert.deepEqual(good.problems, []);
    assert.deepEqual(good.resolution.markerOrder.canonicalOrder, ENGINE_LITERAL_MARKER_ORDER.canonicalOrder);
    assert.deepEqual(good.resolution.edgeTagOrder.canonicalOrder, ENGINE_LITERAL_EDGE_TAG_ORDER.canonicalOrder);

    // ONE READER, THREE KEYS — so it must say WHICH. It hardcoded `tagOrder` in its problem text,
    // which was harmless while it read one key and became a lie the moment it read three.
    const bad = readConfigResolutionDeclaration({ resolution: { ...withOrders, markerOrder: 7 } });
    assert.equal(bad.resolution.markerOrder, undefined);
    assert.ok(
      bad.problems.some((p) => p.includes("resolution.markerOrder")),
      `the problem named the wrong key: ${bad.problems.join("; ")}`,
    );
    assert.ok(!bad.problems.some((p) => p.includes("resolution.tagOrder")), "it blamed tagOrder");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TITLE WRAP — the published table evaluated over the ENGINE'S OWN ANSWERS
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The other pins in this file compare a published literal against an extracted one. This cannot:
// `CompiledRow.when_ast` is an OPAQUE compiled AST, so transcribing it would be guessing at a
// structure the engine never promised.
//
// So `title_style_pin` drove the REAL `_title_style_dispatcher()` over a grid of real node
// contexts — every node type the rows name plus one they do not, every status they test plus one
// they do not and the absent case, and the WAITING_FOR count on both sides of the `gte 1` boundary
// — and recorded what the engine ANSWERED. This side evaluates the PUBLISHED table over the same
// grid and must agree on every cell.
//
// That is stronger than a transcription check: a predicate merely WORDED differently passes, and a
// predicate that is wrong fails, because neither is asserted — only the answers are.

import { ENGINE_LITERAL_RENDER_TITLE_STYLE } from "../scripts/compile-resolution.mjs";
import { titleStyleFor, nodeLocalContext } from "../dist/present.js";

describe("the title wrap — the published table against the engine's own answers", () => {
  const PIN = FIXTURE.titleStyle;

  test("the fixture carries the pin, and the grid actually separates the rows", () => {
    assert.ok(PIN?.grid?.length > 0, "the fixture has no titleStyle grid; regenerate it");
    const answers = new Set(PIN.grid.map((cell) => JSON.stringify(cell.styles)));
    assert.ok(answers.size >= 3, `the grid produced only ${answers.size} distinct answers`);
    assert.ok(PIN.grid.some((c) => c.styles.length === 0), "no cell reaches an empty answer");
  });

  test("THE DIFFERENTIAL: the published table agrees with the engine on every grid cell", () => {
    const table = readConfigResolutionDeclaration({
      resolution: { ...SERVED.resolution, renderTitleStyle: ENGINE_LITERAL_RENDER_TITLE_STYLE },
    }).resolution.renderTitleStyle;
    assert.ok(table, "the reader refused the generator's own title-style table");

    let checked = 0;
    for (const cell of PIN.grid) {
      const fields = cell.status === null ? {} : { status: cell.status };
      const outgoing = Array.from({ length: cell.waitingForOutgoing }, () => "WAITING_FOR");
      const context = nodeLocalContext({ type: cell.nodeType, fields }, outgoing);
      assert.deepEqual(
        [...titleStyleFor(table, context)],
        cell.styles,
        `disagreed on ${cell.nodeType} / status=${cell.status} / WAITING_FOR=${cell.waitingForOutgoing}`,
      );
      checked += 1;
    }
    assert.ok(checked > 20, `only ${checked} cells were compared`);
  });

  test("THE TWO CONTEXT DEFAULTS, each isolated — they are what make the agreement above real", () => {
    const table = ENGINE_LITERAL_RENDER_TITLE_STYLE;
    // ZERO-DEFAULT COUNT. A task that is `waiting` with NO outgoing WAITING_FOR edge must not match
    // the `gte 1` row. If the count resolved to undefined instead of 0 the comparison would be
    // meaningless, and this is the commonest shape in his vault — the contract's own header records
    // that these all render UNSTYLED today.
    assert.deepEqual(
      [...titleStyleFor(table, nodeLocalContext({ type: "task", fields: { status: "waiting" } }, []))],
      [],
    );
    assert.deepEqual(
      [...titleStyleFor(table, nodeLocalContext({ type: "task", fields: { status: "waiting" } }, ["WAITING_FOR"]))],
      ["italic"],
    );
    // NULL-DEFAULT FIELD. A node with no `status` at all must fall through every status row to the
    // fallback, not error and not match.
    assert.deepEqual([...titleStyleFor(table, nodeLocalContext({ type: "task", fields: {} }))], []);
  });

  test("FIRST MATCH WINS, and a later row cannot answer for an earlier one", () => {
    const table = ENGINE_LITERAL_RENDER_TITLE_STYLE;
    // `in_progress` is row 3 and `explainer` is row 5; a task in progress takes bold, and only a
    // node reaching neither takes the fallback.
    assert.deepEqual(
      [...titleStyleFor(table, nodeLocalContext({ type: "task", fields: { status: "in_progress" } }))],
      ["bold"],
    );
    assert.deepEqual(
      [...titleStyleFor(table, nodeLocalContext({ type: "explainer", fields: { status: "open" } }))],
      ["italic"],
    );
    assert.deepEqual(
      [...titleStyleFor(table, nodeLocalContext({ type: "outcome", fields: { status: "in_progress" } }))],
      [],
      "a non-task took the task-only in_progress row",
    );
  });

  test("THE OPERATOR SET IS PINNED — a new engine operator is a refusal, not a silent gap", () => {
    // The published shape carries the rule engine's OWN nine operators rather than the three these
    // rows use, so a row using `or` or `ne` needs no shape change. If the engine's set GROWS, the
    // reader has an operator it cannot evaluate; the Python pin refuses, and this asserts the set
    // the reader was written against.
    assert.deepEqual(PIN.operators, ["and", "eq", "gt", "gte", "lt", "lte", "ne", "not", "or"]);
  });

  test("AN UNKNOWN OPERATOR REFUSES THE WHOLE TABLE, never one row", () => {
    // First-match-wins: skipping an unreadable row silently promotes every row after it, so a node
    // that should have matched the skipped one takes the next row's styles. Refusing gives no
    // answer; skipping gives a wrong one.
    const broken = {
      rows: [{ when: { op: "matches", path: "node.type", value: "task" }, then: ["bold"] }],
      fallback: [],
    };
    const { resolution, problems } = readConfigResolutionDeclaration({
      resolution: { ...SERVED.resolution, renderTitleStyle: broken },
    });
    assert.equal(resolution.renderTitleStyle, undefined, "a table with an unreadable row was accepted");
    assert.ok(problems.some((p) => p.includes('"matches"')), problems.join("; "));
  });
});
