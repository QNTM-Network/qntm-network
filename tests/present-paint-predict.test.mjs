/**
 * PAINT'S OWN PREDICT AFFORDANCE — proof for `paint.ts`'s consumption of `PredictSurface`.
 *
 *   node --test tests/present-paint-predict.test.mjs
 *
 * WHAT THIS FILE COVERS THAT `tests/present-predict.test.mjs` DOES NOT: that file proves the
 * SURFACE's own bookkeeping (arm/take, staleness, reconciliation) in complete isolation from any
 * DOM. This file proves `paint.ts` actually ACTS on what the surface hands back — a real `<span>`
 * lands inside the real row element the prediction names, carries the right text, and never lands
 * anywhere for an abstention or a row this paint could not build.
 *
 * ── SIX SECTIONS ──
 *
 *   1. THE DECORATION LANDS ON THE RIGHT ROW — a checkbox row and a prose row, addressed by their
 *      own `lineIndex`, each get exactly the claim armed for them and nothing else.
 *   2. TWO ROWS FROM ONE ARM — the shape both real predictions need: a claim on the row just
 *      committed AND a claim on a DIFFERENT row (the "parent"), from one `PredictSurface`.
 *   3. SILENCE WHEN THERE IS NOTHING TO DO — no `deps.predict`, nothing armed, a stale source: all
 *      three are no-ops.
 *   4. WITHDRAWAL IS PAINTED, DIFFERENTLY — the reconciling repaint gets the struck-through class,
 *      never the plain one.
 *   5. AN `<input>` HAS NOWHERE TO SHOW A CLAIM — the row currently focused for editing is skipped,
 *      not crashed on.
 *   6. THE ENTRANCE IS ONE-SHOT AND JS-DRIVEN (no `@keyframes` — see paint.ts's own header for why)
 *      — the inline start state is set on the first take() and absent on a repeat.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk } from "./fixtures/dom-stub.mjs";
import { paint, FocusSurface, PredictSurface, PresentationContext } from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

function paintOnce(source, extraDeps = {}) {
  globalThis.document = makeDocument();
  const body = makeBody();
  const deps = { markdown: md, view: "demo", ...extraDeps };
  paint(body, source, new PresentationContext(), deps);
  return body;
}

/** The predict chip(s) somewhere under `body`, in document order. */
const chips = (body) => walk(body).filter((el) => el.className.split(" ").includes("row-prediction"));

describe("1. THE DECORATION LANDS ON THE RIGHT ROW", () => {
  test("a claim on a checkbox row lands inside THAT row's own <label>, not a sibling", () => {
    const SOURCE = ["- [ ] a", "- [ ] b", "- [ ] c"].join("\n");
    const predict = new PredictSurface();
    predict.arm(SOURCE, "demo", [{ lineIndex: 1, text: "🆕 2026-08-04" }]);
    const body = paintOnce(SOURCE, { predict });

    const rows = walk(body).filter((el) => el.tagName === "label");
    assert.equal(rows.length, 3);
    assert.equal(chips(rows[0]).length, 0, "row 0 must carry no claim");
    assert.equal(chips(rows[1]).length, 1, "row 1 must carry exactly the armed claim");
    assert.equal(chips(rows[1])[0].textContent, "🆕 2026-08-04");
    assert.equal(chips(rows[2]).length, 0, "row 2 must carry no claim");
  });

  test("a claim on a prose row lands inside that row's own <div>", () => {
    const SOURCE = ["some prose", "more prose"].join("\n");
    const predict = new PredictSurface();
    predict.arm(SOURCE, "demo", [{ lineIndex: 0, text: "→ outcome" }]);
    const body = paintOnce(SOURCE, { predict });

    const rows = walk(body).filter((el) => el.tagName === "div");
    assert.equal(chips(rows[0]).length, 1);
    assert.equal(chips(rows[0])[0].textContent, "→ outcome");
    assert.equal(chips(rows[1]).length, 0);
  });
});

describe("2. TWO ROWS FROM ONE ARM — the child's own row, and the parent's, from ONE PredictSurface", () => {
  test("stamp-created-at-on-task's own row and a promotion rule's row decorate independently", () => {
    const SOURCE = ["- [ ] parent task", "    - [ ] fresh child"].join("\n");
    const predict = new PredictSurface();
    // lineIndex 1 = the child just committed (the stamp); lineIndex 0 = the parent (the promotion).
    predict.arm(SOURCE, "demo", [
      { lineIndex: 1, text: "🆕 2026-08-04" },
      { lineIndex: 0, text: "#outcome" },
    ]);
    const body = paintOnce(SOURCE, { predict });

    const rows = walk(body).filter((el) => el.tagName === "label");
    assert.equal(chips(rows[0])[0].textContent, "#outcome", "the parent row carries the promotion claim");
    assert.equal(chips(rows[1])[0].textContent, "🆕 2026-08-04", "the child's own row carries the stamp claim");
  });
});

describe("3. SILENCE WHEN THERE IS NOTHING TO DO", () => {
  const SOURCE = "- [ ] a";

  test("no `deps.predict` at all — no chip anywhere", () => {
    const body = paintOnce(SOURCE, {});
    assert.equal(chips(body).length, 0);
  });

  test("a predict surface with nothing armed is the same as none at all", () => {
    const predict = new PredictSurface();
    const body = paintOnce(SOURCE, { predict });
    assert.equal(chips(body).length, 0);
  });

  test("an instruction armed against a DIFFERENT, now-CONFIRMED source paints no PENDING chip", () => {
    const CONFIRMED_SOURCE = "- [ ] a #task 🆕 2026-08-04";
    const predict = new PredictSurface();
    // Armed against the PRE-answer source; painting the ARRIVED source below, which already
    // carries the claim's own text — a confirmed reconciliation, which is silence (present-
    // predict.test.mjs §4).
    predict.arm(SOURCE, "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    const body = paintOnce(CONFIRMED_SOURCE, { predict });
    assert.equal(chips(body).length, 0, "a confirmed claim is not painted as a pending chip");
  });
});

describe("4. WITHDRAWAL IS PAINTED, DIFFERENTLY — the struck-through class, never the plain one", () => {
  test("a contradicted claim paints the withdrawn class on the row it was armed against", () => {
    const SOURCE = "- [ ] a #task";
    const predict = new PredictSurface();
    // Armed against a DIFFERENT, now-superseded source whose text is nowhere in SOURCE.
    predict.arm("- [ ] a", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    const body = paintOnce(SOURCE, { predict });

    const rows = walk(body).filter((el) => el.tagName === "label");
    const chip = chips(rows[0])[0];
    assert.notEqual(chip, undefined, "the withdrawal must still be painted, not silently dropped");
    assert.match(chip.className, /\brow-prediction-withdrawn\b/);
    assert.equal(chip.textContent, "🆕 2026-08-04", "the withdrawn chip still names what was claimed");
  });

  test("MUTATION PROOF: a CONFIRMED claim never carries the withdrawn class", () => {
    const SOURCE = "- [ ] a #task 🆕 2026-08-04";
    const predict = new PredictSurface();
    predict.arm("- [ ] a", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    const body = paintOnce(SOURCE, { predict });
    assert.equal(chips(body).length, 0, "a confirmed claim paints nothing at all, withdrawn or otherwise");
  });
});

describe("5. AN <input> HAS NOWHERE TO SHOW A CLAIM", () => {
  test("the focused, editable row is skipped rather than crashed on", () => {
    const SOURCE = "- [ ] a";
    const focus = new FocusSurface();
    focus.focus(0, SOURCE, 0, "demo");
    const predict = new PredictSurface();
    predict.arm(SOURCE, "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    // No throw — the whole assertion for this test.
    const body = paintOnce(SOURCE, { predict, focus });
    const inputs = walk(body).filter((el) => el.tagName === "input");
    assert.equal(inputs.length, 1, "precondition: the row really is an <input>");
    assert.equal(chips(body).length, 0, "nothing was appended to an element that cannot show it");
  });
});

describe("6. THE ENTRANCE IS ONE-SHOT AND JS-DRIVEN", () => {
  test("the first take() sets an inline start state and schedules exactly one frame; a repeat take() does not", () => {
    const frames = [];
    const savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => frames.push(cb);
    try {
      const SOURCE = "- [ ] a";
      const predict = new PredictSurface();
      predict.arm(SOURCE, "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
      const body = paintOnce(SOURCE, { predict });
      const chip = chips(body)[0];
      assert.equal(frames.length, 1, "the first (animated) appearance must schedule exactly one frame");
      assert.equal(chip.style.transition, "none", "no transition on the frame that builds the element");
      assert.equal(chip.style.opacity, "0");
      assert.match(chip.style.transform, /^translateY\(-?[\d.]+em\)$/);
      frames[0]();
      assert.equal(chip.style.opacity, "", "the inline override is cleared, handing motion to the stylesheet");
      assert.equal(chip.style.transform, "");
      assert.equal(chip.style.transition, "");
    } finally {
      if (savedRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = savedRaf;
    }
  });

  test("a repeat take() of the SAME still-pending claim paints a chip with no inline entrance state at all", () => {
    const SOURCE = "- [ ] a";
    const predict = new PredictSurface();
    predict.arm(SOURCE, "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    paintOnce(SOURCE, { predict }); // first paint — consumes the animation
    const body = paintOnce(SOURCE, { predict }); // a second repaint of the identical source/view
    const chip = chips(body)[0];
    assert.notEqual(chip, undefined, "the claim must still be shown on the second repaint");
    assert.equal(chip.style.opacity ?? "", "", "no entrance state on a repeat repaint");
  });

  test("a withdrawal never sets the entrance state — it is reporting something already decided, not arriving", () => {
    const SOURCE = "- [ ] a #task";
    const predict = new PredictSurface();
    predict.arm("- [ ] a", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    const body = paintOnce(SOURCE, { predict });
    const chip = chips(body)[0];
    assert.equal(chip.style.opacity ?? "", "", "a withdrawn chip does not rise in");
  });
});
