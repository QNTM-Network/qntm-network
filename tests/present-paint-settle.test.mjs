/**
 * PAINT'S OWN SETTLE AFFORDANCE — proof for `paint.ts`'s consumption of `SettleSurface`, and for
 * `settleRow`'s FLIP motion. roadmap-the-road-ahead.md step 3.
 *
 *   node --test tests/present-paint-settle.test.mjs
 *
 * WHAT THIS FILE COVERS THAT `tests/present-settle.test.mjs` DOES NOT: that file proves the
 * SURFACE's own bookkeeping (arm/take, source-keying, one-shot animation) in complete isolation
 * from any DOM. This file proves `paint.ts` actually ACTS on what the surface hands back — the row
 * really moves in `body.children`, the motion really is FLIP (measured before AND after the
 * reorder, not assumed), and — the two hazards named for this whole change — the row the operator
 * is looking at is never the row that relocates while he is typing on it, and its cursor survives
 * the move by IDENTITY, the same property `focus.reanchor` already guarantees for a genuine
 * engine reorder.
 *
 * ── FIVE SECTIONS ──
 *
 *   1. THE REORDER ITSELF — `body.children` really changes order, `null` really means "last."
 *   2. SILENCE WHEN THERE IS NOTHING TO DO — no `deps.settle`, nothing armed, or an armed
 *      instruction for a DIFFERENT source: three ways to be a no-op, each proven separately.
 *   3. THE MOTION IS FLIP, MEASURED — real before/after geometry (this fixture's own minimal
 *      layout model, index × a constant row height — see dom-stub.mjs), a transform that is set
 *      mid-flight and cleared once the deferred frame runs, and never replayed on a repeat
 *      `take()` of the same instruction.
 *   4. THE CARET SURVIVES — a line under `focus` that also happens to be the row `settle` moves:
 *      the SAME element stays focused, `focus.lineIndex` is untouched (this mechanism reorders
 *      `viewBody`, never `source`, so there is no index to desync — see this file's own comment at
 *      the test for why `reanchor` is therefore not called here), and `focus.anchor`'s identity is
 *      unchanged.
 *   5. THE COMBINED PROOF — a DOM-only settle followed by a GENUINE textual reorder (the engine's
 *      own answer, arriving later): `focus.reanchor` — untouched by this change, already proven
 *      elsewhere — still finds the row by identity and reports its new index correctly. This is
 *      the property hazard 1 asked for named or used; here it is used, in combination.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk } from "./fixtures/dom-stub.mjs";
import { paint, FocusSurface, SettleSurface, PresentationContext } from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

// FLAT, NON-CHECKBOX, NON-STAMPED ON PURPOSE. This file proves the PAINTER's mechanics, not
// ordering.ts's own agreement claim (tests/present-ordering.test.mjs) — a plain three-row section
// is enough to drive `rowsByLineIndex` and `settleRow`, and carrying no `[[qntm:N]]` stamp means
// `instance.ts`'s identity falls back to the line's own TEXT, which §5 below relies on.
const SOURCE = ["## Queue", "row a", "row b", "row c"].join("\n");

/** Paint once, with a fresh document and body, and whatever deps the caller adds to the base. */
function paintOnce(source, extraDeps = {}) {
  globalThis.document = makeDocument();
  const body = makeBody();
  const deps = { markdown: md, view: "demo", ...extraDeps };
  paint(body, source, new PresentationContext(), deps);
  return body;
}

/** The prose rows' own text, in DOM order — skips the heading, which is always children[0]. */
const roseTexts = (body) => walk(body).filter((el) => el.tagName === "div").map((el) => el.innerHTML);

describe("1. THE REORDER ITSELF", () => {
  test("moving the last row before the first re-slots every row between them", () => {
    const settle = new SettleSurface();
    // "row c" (lineIndex 3) belongs immediately before "row a" (lineIndex 1).
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    const body = paintOnce(SOURCE, { settle });
    const texts = roseTexts(body);
    assert.equal(texts.length, 3, `expected 3 prose rows, got ${texts.length}: ${JSON.stringify(texts)}`);
    assert.match(texts[0], /row c/);
    assert.match(texts[1], /row a/);
    assert.match(texts[2], /row b/);
  });

  test("beforeLineIndex: null places the row LAST", () => {
    const settle = new SettleSurface();
    // "row a" (lineIndex 1) belongs after everything else in the section.
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: null });
    const body = paintOnce(SOURCE, { settle });
    const texts = roseTexts(body);
    assert.match(texts[0], /row b/);
    assert.match(texts[1], /row c/);
    assert.match(texts[2], /row a/);
  });
});

describe("2. SILENCE WHEN THERE IS NOTHING TO DO", () => {
  test("no `deps.settle` at all — byte-for-byte the order the source already has", () => {
    const body = paintOnce(SOURCE, {});
    const texts = roseTexts(body);
    assert.match(texts[0], /row a/);
    assert.match(texts[1], /row b/);
    assert.match(texts[2], /row c/);
  });

  test("a settle surface with nothing armed is the same as none at all", () => {
    const settle = new SettleSurface();
    const body = paintOnce(SOURCE, { settle });
    const texts = roseTexts(body);
    assert.match(texts[0], /row a/);
    assert.match(texts[1], /row b/);
    assert.match(texts[2], /row c/);
  });

  test("an instruction armed against a DIFFERENT source never applies to THIS paint", () => {
    const settle = new SettleSurface();
    settle.arm("## Queue\nrow a\nrow b\nrow c\nTHIS IS A DIFFERENT FILE", "demo", {
      lineIndex: 3,
      beforeLineIndex: 1,
    });
    const body = paintOnce(SOURCE, { settle });
    const texts = roseTexts(body);
    assert.match(texts[0], /row a/, "the stale instruction must not have reordered anything");
    assert.match(texts[1], /row b/);
    assert.match(texts[2], /row c/);
  });
});

describe("3. THE MOTION IS FLIP, MEASURED — not assumed", () => {
  test("the moving row's transform is set mid-flight and cleared once the deferred frame runs", () => {
    const frames = [];
    const savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => frames.push(cb);
    try {
      const settle = new SettleSurface();
      settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
      const body = paintOnce(SOURCE, { settle });
      const movingEl = walk(body).filter((el) => el.tagName === "div")[0];
      // MID-FLIGHT: the frame has NOT run yet (this fixture's `requestAnimationFrame` only
      // records it), so the transform must still be the FLIP's translate, not cleared.
      assert.equal(frames.length, 1, "settleRow must schedule exactly one frame for an animated move");
      assert.match(movingEl.className, /\bsettle-move\b/);
      assert.match(movingEl.style.transform, /^translateY\(-?\d+px\)$/, movingEl.style.transform);
      assert.equal(movingEl.style.transition, "none", "the snap-back must be instant, not animated");
      // RUN THE FRAME — the same thing a real browser's next paint does.
      frames[0]();
      assert.equal(movingEl.style.transform, "", "the transform must resolve to rest once the frame runs");
      assert.equal(movingEl.style.transition, "", "the transition falls back to the stylesheet's own rule");
    } finally {
      if (savedRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = savedRaf;
    }
  });

  test("with no requestAnimationFrame global at all, the transform still resolves to rest synchronously", () => {
    // THE NODE TEST ENVIRONMENT'S OWN SHAPE, restated as a assertion: `paint.ts`'s `settleRow`
    // falls back to calling its "settled" step directly when there is no real browser frame to
    // wait for, so a suite that never touches `requestAnimationFrame` (every OTHER test in this
    // file) still proves the transform does not leak past the paint that set it.
    assert.equal(typeof globalThis.requestAnimationFrame, "undefined", "precondition: no rAF installed");
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    const body = paintOnce(SOURCE, { settle });
    const movingEl = walk(body).filter((el) => el.tagName === "div")[0];
    assert.equal(movingEl.style.transform, "");
  });

  test("a repeat take() of the SAME still-armed instruction repositions but does not replay the motion", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    paintOnce(SOURCE, { settle }); // first paint — consumes the animation
    const body = paintOnce(SOURCE, { settle }); // a SECOND repaint of the identical source/view
    const texts = roseTexts(body);
    assert.match(texts[0], /row c/, "the row must still be repositioned on the second repaint");
    const movingEl = walk(body).filter((el) => el.tagName === "div")[0];
    assert.equal(movingEl.className, "", "the second repaint must not carry the settle-move class at all");
    assert.equal(movingEl.style.transform ?? "", "", "no motion on the second repaint");
  });
});

describe("4. THE CARET SURVIVES A DOM-ONLY REORDER", () => {
  test("the focused row keeps its element, its index, and its anchor identity across the move", () => {
    const settle = new SettleSurface();
    const focus = new FocusSurface();
    // The cursor is on "row c" (lineIndex 3) — the SAME row `settle` is about to relocate.
    focus.focus(3, SOURCE, 0, "demo");
    const anchorBefore = focus.anchor;
    assert.ok(anchorBefore !== null, "precondition: the cursor must have taken a real anchor");

    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    const body = paintOnce(SOURCE, { settle, focus });

    const inputs = walk(body).filter((el) => el.tagName === "input" && el.type === "text");
    assert.equal(inputs.length, 1, "the focused row must still be the one editable row");
    assert.equal(inputs[0].focused, true, "the SAME element that moved must still hold the caret");
    assert.equal(inputs[0].value, "row c", "the caret is on the row that moved, not a different one");

    // ── WHY `reanchor` IS NOT CALLED HERE, STATED RATHER THAN SILENTLY OMITTED ──
    //
    // `reanchor` exists for when the SOURCE STRING's own shape changes — a line inserted, removed,
    // or genuinely reordered in the text the file holds (see focus.ts's own header and §5 below).
    // This settle mechanism never touches `source`: `paint()` was handed the IDENTICAL string
    // before and after, and only the DOM's presentation order moved. So `focus.lineIndex` is not
    // merely "still correct" — it was NEVER at risk, by construction, the same way the caret this
    // repo destroyed once was at risk from a NUMERIC clamp applied to a source the index did not
    // come from (paint.ts's own history, cited in this PR's brief). Asserted directly:
    assert.equal(focus.lineIndex, 3, "the index must be untouched — nothing reordered `source`");
    assert.deepEqual(focus.anchor, anchorBefore, "the anchor identity must be byte-identical, not merely equal");
  });
});

describe("5. THE COMBINED PROOF — a DOM-only settle, then a GENUINE textual reorder, both survived", () => {
  test("reanchor (untouched by this change) still finds the row by identity once the engine really moves it", () => {
    const settle = new SettleSurface();
    const focus = new FocusSurface();
    focus.focus(3, SOURCE, 0, "demo");

    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    paintOnce(SOURCE, { settle, focus }); // the browser's own prediction, shown immediately

    // THE ENGINE'S OWN ANSWER ARRIVES — a projection where "row c" has GENUINELY moved in the
    // TEXT, exactly where this browser predicted it would. `reanchor` is the pre-existing,
    // separately-tested mechanism (tests/present-anchor.test.mjs) this settle affordance never
    // modifies; it is exercised here only to prove the two mechanisms compose rather than fight.
    const ARRIVED = ["## Queue", "row c", "row a", "row b"].join("\n");
    const reading = focus.reanchor(ARRIVED, "demo");
    assert.equal(reading.outcome, "found");
    assert.equal(reading.lineIndex, 1, "row c now really is at index 1 in the arriving text");
    assert.equal(focus.lineIndex, 1, "the surface itself followed the row to its real new index");
  });
});
