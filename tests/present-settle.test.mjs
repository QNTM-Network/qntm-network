/**
 * SETTLE SURFACE — proof for app/present/settle.ts, roadmap-the-road-ahead.md step 3.
 *
 *   node --test tests/present-settle.test.mjs
 *
 * PURE unit tests of the class alone — no DOM, no `app/index.html` wiring (that is
 * `tests/app-ordering-note.test.mjs`), no painter (that is `tests/present-paint-settle.test.mjs`).
 *
 * ── FOUR SECTIONS ──
 *
 *   1. ARM THEN TAKE — the basic contract: what was armed is what `take` returns, for the exact
 *      `source`/`view` it was armed against.
 *   2. SOURCE-KEYED STALENESS — a mismatch on EITHER `source` or `view` returns `null`, and needs
 *      no separate `clear()`; a later call with the matching pair still works (nothing was
 *      corrupted by the mismatched call).
 *   3. ONE-SHOT ANIMATION, STICKY POSITION — the first `take()` for an armed instruction answers
 *      `animate: true`; every subsequent `take()` of the SAME still-live instruction answers
 *      `animate: false` while still returning the placement (the row stays put; only the motion
 *      is not replayed).
 *   4. A SECOND `arm()` REPLACES THE FIRST, EVEN UNTAKEN — there is one pending settle, the same
 *      way there is one cursor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SettleSurface } from "../dist/present.js";

describe("1. arm then take — the basic contract", () => {
  test("take() for the exact source/view armed returns the placement, unset", () => {
    const settle = new SettleSurface();
    settle.arm("## H\n- a\n- b", "demo", { lineIndex: 1, beforeLineIndex: 2 });
    const instruction = settle.take("## H\n- a\n- b", "demo");
    assert.deepEqual(instruction, {
      placement: { lineIndex: 1, beforeLineIndex: 2 },
      animate: true,
    });
  });

  test("a beforeLineIndex of null (last position) round-trips exactly", () => {
    const settle = new SettleSurface();
    settle.arm("src", "v", { lineIndex: 3, beforeLineIndex: null });
    assert.deepEqual(settle.take("src", "v").placement, { lineIndex: 3, beforeLineIndex: null });
  });

  test("take() before anything is ever armed returns null", () => {
    const settle = new SettleSurface();
    assert.equal(settle.take("anything", "demo"), null);
  });
});

describe("2. SOURCE-KEYED STALENESS — a mismatch on source or view is null, and needs no clear()", () => {
  test("a different source string than the one armed returns null", () => {
    const settle = new SettleSurface();
    settle.arm("source A", "demo", { lineIndex: 0, beforeLineIndex: null });
    assert.equal(settle.take("source B", "demo"), null);
  });

  test("a different view id than the one armed returns null", () => {
    const settle = new SettleSurface();
    settle.arm("source A", "demo", { lineIndex: 0, beforeLineIndex: null });
    assert.equal(settle.take("source A", "other-view"), null);
  });

  test("a stale take() attempt does not corrupt the still-armed instruction for the RIGHT source", () => {
    // THE REGRESSION THIS GUARDS: a naive `take()` that cleared `#placement` on ANY call — matched
    // or not — would make the correct call right after a wrong one see nothing armed, exactly the
    // bug a one-shot-on-every-call implementation would have.
    const settle = new SettleSurface();
    settle.arm("source A", "demo", { lineIndex: 5, beforeLineIndex: 6 });
    assert.equal(settle.take("source B", "demo"), null, "the mismatched call");
    const instruction = settle.take("source A", "demo");
    assert.notEqual(instruction, null, "the matching call must still see the armed instruction");
    assert.deepEqual(instruction.placement, { lineIndex: 5, beforeLineIndex: 6 });
  });

  test("once a NEW source is armed, the OLD source can never match again — no leak across an edit", () => {
    const settle = new SettleSurface();
    settle.arm("source A", "demo", { lineIndex: 0, beforeLineIndex: null });
    settle.arm("source B", "demo", { lineIndex: 1, beforeLineIndex: null });
    assert.equal(settle.take("source A", "demo"), null, "the superseded source must never match again");
  });
});

describe("3. ONE-SHOT ANIMATION, STICKY POSITION", () => {
  test("the first take() of an armed instruction animates; every later one of the SAME instruction does not", () => {
    const settle = new SettleSurface();
    settle.arm("src", "v", { lineIndex: 2, beforeLineIndex: null });
    const first = settle.take("src", "v");
    const second = settle.take("src", "v");
    const third = settle.take("src", "v");
    assert.equal(first.animate, true, "the first repaint must be the one that shows the motion");
    assert.equal(second.animate, false, "a repeat repaint must not replay the slide");
    assert.equal(third.animate, false, "nor a third");
    // AND THE POSITION IS STILL RETURNED EVERY TIME — the row must stay placed across incidental
    // repaints (a `j`/`k`, a mode change) even though the animation itself is shown only once.
    assert.deepEqual(second.placement, { lineIndex: 2, beforeLineIndex: null });
    assert.deepEqual(third.placement, { lineIndex: 2, beforeLineIndex: null });
  });
});

describe("4. A SECOND arm() REPLACES THE FIRST, EVEN UNTAKEN — one pending settle, like one cursor", () => {
  test("arming twice before any take() leaves only the SECOND instruction reachable", () => {
    const settle = new SettleSurface();
    settle.arm("src", "v", { lineIndex: 1, beforeLineIndex: 2 });
    settle.arm("src", "v", { lineIndex: 9, beforeLineIndex: null });
    const instruction = settle.take("src", "v");
    assert.deepEqual(instruction.placement, { lineIndex: 9, beforeLineIndex: null });
  });

  test("re-arming the SAME instruction resets the one-shot animation flag", () => {
    const settle = new SettleSurface();
    settle.arm("src", "v", { lineIndex: 1, beforeLineIndex: 2 });
    settle.take("src", "v"); // consumes the animation
    settle.arm("src", "v", { lineIndex: 1, beforeLineIndex: 2 }); // a fresh commit, same placement
    const instruction = settle.take("src", "v");
    assert.equal(instruction.animate, true, "a fresh arm() is a fresh admission and must animate again");
  });
});
