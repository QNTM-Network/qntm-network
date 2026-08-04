/**
 * PREDICT SURFACE — proof for app/present/predict.ts, the last-mile paint-predictions leg.
 *
 *   node --test tests/present-predict.test.mjs
 *
 * PURE unit tests of the class alone — no DOM, no `app/index.html` wiring (that is
 * `tests/app-predict-wiring.test.mjs`), no painter (that is `tests/present-paint-predict.test.mjs`).
 * Deliberately mirrors `tests/present-settle.test.mjs`'s own section shape, because `PredictSurface`
 * is `SettleSurface`'s sibling and a reader who already trusts one should recognise the other.
 *
 * ── FIVE SECTIONS ──
 *
 *   1. ARM THEN TAKE — the basic contract: what was armed is what `take` returns, for the exact
 *      `source`/`view` it was armed against.
 *   2. SOURCE-KEYED STALENESS AND VIEW MISMATCH — a view mismatch returns `null` and touches
 *      nothing; a source mismatch RECONCILES (section 4 covers what that produces).
 *   3. ONE-SHOT ANIMATION, STICKY CONTENT — the first `take()` for an armed instruction answers
 *      `animate: true`; every later `take()` of the SAME still-live instruction answers `animate:
 *      false` while still returning the predictions.
 *   4. RECONCILIATION — a NEW source for the SAME view either confirms a claim (silence, no
 *      `withdrawn` entry) or contradicts it (`withdrawn`, exactly once, then the arm is gone).
 *   5. ONE ARMED INSTRUCTION — a second `arm()` replaces the first, even with an empty list, and an
 *      empty arm cannot later be "reconciled" into a false withdrawal.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PredictSurface } from "../dist/present.js";

describe("1. arm then take — the basic contract", () => {
  test("take() for the exact source/view armed returns the predictions, unset, animate true", () => {
    const predict = new PredictSurface();
    predict.arm("- [ ] a", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    const instruction = predict.take("- [ ] a", "demo");
    assert.deepEqual(instruction, {
      predictions: [{ lineIndex: 0, text: "🆕 2026-08-04" }],
      withdrawn: [],
      animate: true,
    });
  });

  test("two predictions on two different rows round-trip together — the child and the parent", () => {
    const predict = new PredictSurface();
    predict.arm("src", "v", [
      { lineIndex: 2, text: "🆕 2026-08-04" },
      { lineIndex: 1, text: "#outcome" },
    ]);
    const instruction = predict.take("src", "v");
    assert.deepEqual(instruction.predictions, [
      { lineIndex: 2, text: "🆕 2026-08-04" },
      { lineIndex: 1, text: "#outcome" },
    ]);
  });

  test("take() before anything is ever armed returns null", () => {
    const predict = new PredictSurface();
    assert.equal(predict.take("anything", "demo"), null);
  });

  test("an arm() with an empty list is never returned as a live instruction", () => {
    const predict = new PredictSurface();
    predict.arm("src", "v", []);
    assert.equal(predict.take("src", "v"), null, "nothing was actually predicted, so nothing is shown");
  });
});

describe("2. SOURCE-KEYED STALENESS AND VIEW MISMATCH", () => {
  test("a different view id than the one armed returns null and leaves the arm untouched", () => {
    const predict = new PredictSurface();
    predict.arm("source A", "demo", [{ lineIndex: 0, text: "x" }]);
    assert.equal(predict.take("source A", "other-view"), null);
    // THE ARM SURVIVES an irrelevant view's own repaint — the correct view can still see it.
    const instruction = predict.take("source A", "demo");
    assert.notEqual(instruction, null, "an unrelated view's repaint must not have cleared this arm");
    assert.deepEqual(instruction.predictions, [{ lineIndex: 0, text: "x" }]);
  });

  test("a stale take() attempt (wrong view) does not corrupt the still-armed instruction for the RIGHT view", () => {
    const predict = new PredictSurface();
    predict.arm("source A", "demo", [{ lineIndex: 5, text: "y" }]);
    assert.equal(predict.take("source A", "elsewhere"), null, "the mismatched call");
    const instruction = predict.take("source A", "demo");
    assert.notEqual(instruction, null, "the matching call must still see the armed instruction");
    assert.deepEqual(instruction.predictions, [{ lineIndex: 5, text: "y" }]);
  });
});

describe("3. ONE-SHOT ANIMATION, STICKY CONTENT", () => {
  test("the first take() of an armed instruction animates; every later one of the SAME instruction does not", () => {
    const predict = new PredictSurface();
    predict.arm("src", "v", [{ lineIndex: 2, text: "🆕 2026-08-04" }]);
    const first = predict.take("src", "v");
    const second = predict.take("src", "v");
    const third = predict.take("src", "v");
    assert.equal(first.animate, true, "the first repaint must be the one that shows the arrival");
    assert.equal(second.animate, false, "a repeat repaint must not replay the entrance");
    assert.equal(third.animate, false, "nor a third");
    // AND THE CONTENT IS STILL RETURNED EVERY TIME — the claim must keep showing across incidental
    // repaints (a `j`/`k`, a mode change) even though the entrance motion is shown only once.
    assert.deepEqual(second.predictions, [{ lineIndex: 2, text: "🆕 2026-08-04" }]);
    assert.deepEqual(third.predictions, [{ lineIndex: 2, text: "🆕 2026-08-04" }]);
  });
});

describe("4. RECONCILIATION — a new source for the same view either confirms or contradicts", () => {
  test("CONFIRMED: the claim's text is found in the new source — silence, no withdrawn entry, arm cleared", () => {
    const predict = new PredictSurface();
    predict.arm("- [ ] a", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    predict.take("- [ ] a", "demo"); // the optimistic repaint, consumed

    const ARRIVED = "- [ ] a #task 🆕 2026-08-04";
    const instruction = predict.take(ARRIVED, "demo");
    assert.equal(instruction, null, "a confirmed claim reports nothing — it is now ordinary content");

    // AND THE ARM IS GONE — a THIRD repaint of the arrived source must not re-reconcile it.
    const again = predict.take(ARRIVED, "demo");
    assert.equal(again, null, "reconciliation is one-shot; nothing is left to report twice");
  });

  test("CONTRADICTED: the claim's text is nowhere in the new source — withdrawn once, then gone", () => {
    const predict = new PredictSurface();
    predict.arm("- [ ] a", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    predict.take("- [ ] a", "demo"); // the optimistic repaint, consumed

    const ARRIVED = "- [ ] a #task"; // the engine answered, and did not add the stamp
    const instruction = predict.take(ARRIVED, "demo");
    assert.notEqual(instruction, null);
    assert.deepEqual(instruction.predictions, [], "a reconciling repaint shows no NEW pending claims");
    assert.deepEqual(instruction.withdrawn, [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    assert.equal(instruction.animate, true, "the withdrawal must be shown, not silently applied");

    // ONE-SHOT: the very next repaint of the SAME arrived source must not report it again.
    const again = predict.take(ARRIVED, "demo");
    assert.equal(again, null, "a withdrawal is reported exactly once, then the arm is gone");
  });

  test("MIXED: two predictions, one confirmed and one contradicted in the SAME reconciling repaint", () => {
    const predict = new PredictSurface();
    predict.arm("src", "demo", [
      { lineIndex: 0, text: "🆕 2026-08-04" },
      { lineIndex: 3, text: "#outcome" },
    ]);
    predict.take("src", "demo");

    const ARRIVED = "- [ ] a 🆕 2026-08-04\n- [ ] b\n- [ ] c\n- [ ] parent #task";
    const instruction = predict.take(ARRIVED, "demo");
    assert.deepEqual(instruction.withdrawn, [{ lineIndex: 3, text: "#outcome" }], "only the wrong claim is withdrawn");
  });

  test("a source that never actually changed a view whose take() was never called against it still reconciles correctly once asked", () => {
    // THE FIRST take() OF A GIVEN SOURCE NEEDS NO PRIOR "consuming" CALL — reconciliation is driven
    // purely by armed-source vs asked-source, not by a flag set during an earlier `take()`.
    const predict = new PredictSurface();
    predict.arm("src", "demo", [{ lineIndex: 0, text: "X" }]);
    const instruction = predict.take("a totally different source", "demo");
    assert.deepEqual(instruction.withdrawn, [{ lineIndex: 0, text: "X" }]);
  });
});

describe("5. ONE ARMED INSTRUCTION — a second arm() replaces the first, even with an empty list", () => {
  test("arming twice before any take() leaves only the SECOND instruction reachable", () => {
    const predict = new PredictSurface();
    predict.arm("src", "v", [{ lineIndex: 1, text: "first" }]);
    predict.arm("src", "v", [{ lineIndex: 9, text: "second" }]);
    const instruction = predict.take("src", "v");
    assert.deepEqual(instruction.predictions, [{ lineIndex: 9, text: "second" }]);
  });

  test("re-arming the SAME instruction resets the one-shot animation flag", () => {
    const predict = new PredictSurface();
    predict.arm("src", "v", [{ lineIndex: 1, text: "x" }]);
    predict.take("src", "v"); // consumes the animation
    predict.arm("src", "v", [{ lineIndex: 1, text: "x" }]); // a fresh commit, same claim
    const instruction = predict.take("src", "v");
    assert.equal(instruction.animate, true, "a fresh arm() is a fresh admission and must animate again");
  });

  test("THE INSTINCT THAT WAS WRONG: an EMPTY arm() must still supersede a pending one — otherwise a later, unrelated commit's own optimistic repaint falsely reconciles it", () => {
    const predict = new PredictSurface();
    // A first commit predicts something real.
    predict.arm("source A", "demo", [{ lineIndex: 0, text: "🆕 2026-08-04" }]);
    predict.take("source A", "demo"); // shown once

    // A second, UNRELATED commit lands before the first cycle answers — it predicts nothing of its
    // own, but it MUST still re-arm (with an empty list), superseding the first claim.
    predict.arm("source B", "demo", []);

    // The optimistic repaint of the second commit must not report the first claim as withdrawn —
    // nothing has actually contradicted it; the view has simply moved on.
    const instruction = predict.take("source B", "demo");
    assert.equal(instruction, null, "an unrelated commit must not falsely accuse an earlier, still-unanswered claim");
  });
});
