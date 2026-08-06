/**
 * SETTLE SURFACE — proof for app/present/settle.ts, roadmap-the-road-ahead.md step 3.
 *
 *   node --test tests/present-settle.test.mjs
 *
 * PURE unit tests of the class alone — no DOM, no `app/index.html` wiring (that is
 * `tests/app-ordering-note.test.mjs`), no painter (that is `tests/present-paint-settle.test.mjs`).
 *
 * ── FIVE SECTIONS, REWRITTEN 2026-08-06 FOR THE IDENTITY KEY ──
 *
 * `SettleSurface` used to key an armed placement on the EXACT source string it was computed from —
 * `take` refused the instant that string was not byte-identical. `docs/implementation-artifacts/`
 * traces the defect that key caused: an engine-minted `[[qntm:N]]` stamp landing on the row's own
 * line, on its very next real answer, changed the string without changing the row's position, and
 * the old key could not tell those apart — it discarded a still-correct placement every time. This
 * file's fixtures used to be arbitrary one-line placeholders (`"src"`, `"source A"`) because the old
 * contract never looked past the string; the new contract resolves a real row's IDENTITY
 * (`resolveInstanceAnchor`, `instance.ts`), so every fixture here is now real, resolvable markdown.
 *
 *   1. ARM THEN TAKE — the basic contract: what was armed is what `take` returns, for the row it
 *      names, in the exact `source`/`view` it was armed against.
 *   2. IDENTITY-KEYED STALENESS — a placement SURVIVES a later source that changes nothing about
 *      the armed row's own identity (the stamp-arrival case this whole change exists for) and is
 *      DISCARDED the moment the row genuinely cannot be re-found — a view mismatch, the row
 *      deleted, or a second, different arm superseding the first.
 *   3. ONE-SHOT ANIMATION, STICKY POSITION — the first `take()` for an armed instruction answers
 *      `animate: true`; every subsequent `take()` of the SAME still-live instruction answers
 *      `animate: false` while still returning the placement (the row stays put; only the motion
 *      is not replayed).
 *   4. A SECOND `arm()` REPLACES THE FIRST, EVEN UNTAKEN — there is one pending settle, the same
 *      way there is one cursor.
 *   5. `supersede` — A SECOND COMMIT TO THE ARMED ROW DISCARDS IT BEFORE IT CAN FIRE A STALE
 *      MOTION. `settle.ts`'s own header names this the third discard condition; this section is its
 *      direct proof, isolated from `commitLine`'s own wiring (that composition is
 *      `tests/app-settle-wiring.test.mjs` §3).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SettleSurface } from "../dist/present.js";

/** A flat, stamped, three-row section — every sibling already carries `[[qntm:N]]`, the shape
 * `ordering.ts`'s own header records as the common real case for an EXISTING row being reordered. */
const SOURCE = ["## Queue", "- [ ] a [[qntm:1]]", "- [ ] b [[qntm:2]]", "- [ ] c [[qntm:3]]"].join("\n");

describe("1. arm then take — the basic contract", () => {
  test("take() for the exact source/view armed returns the placement, unset", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    const instruction = settle.take(SOURCE, "demo");
    assert.deepEqual(instruction, {
      placement: { lineIndex: 1, beforeLineIndex: 2 },
      animate: true,
    });
  });

  test("a beforeLineIndex of null (last position) round-trips exactly", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: null });
    assert.deepEqual(settle.take(SOURCE, "demo").placement, { lineIndex: 3, beforeLineIndex: null });
  });

  test("take() before anything is ever armed returns null", () => {
    const settle = new SettleSurface();
    assert.equal(settle.take("anything", "demo"), null);
  });

  test("arm() against a blank or out-of-range line arms nothing — a defensive floor, not a live path", () => {
    // `orderingPlacementFor` never returns a blank line's index (no marker value to rank a blank
    // line by), so this is unrealistic input — but `instanceAnchorFor` answers `null` for it, and
    // `arm` must not pretend it has an identity to hold onto.
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 99, beforeLineIndex: null });
    assert.equal(settle.take(SOURCE, "demo"), null, "an unresolvable moving row must arm nothing");
  });
});

describe("2. IDENTITY-KEYED STALENESS — survives what does not touch the row, refuses what does", () => {
  test("a later source that ONLY appends a stamp to the armed row's own line still resolves — the exact regression this change fixes", () => {
    // The row is captured with no stamp yet — its identity is its own characters (instance.ts's
    // honest floor for an unstamped line) — and the engine's own next answer mints one, appended
    // after the text. `resolveInstanceAnchor`'s INSTANCE rung misses (the token changed), the NODE
    // rung cannot search (armed with no node), and the RELATIVE rung — `relative.ts`'s own
    // "acceptance criterion" for exactly this case — finds it, bracketed by its stamped neighbours,
    // confirmed because the arrived text still starts with what was armed.
    const armedAgainst = ["## Queue", "- [ ] NEW ROW", "- [ ] a [[qntm:1]]", "- [ ] b [[qntm:2]]"].join("\n");
    const settle = new SettleSurface();
    settle.arm(armedAgainst, "demo", { lineIndex: 1, beforeLineIndex: 2 });

    const stamped = ["## Queue", "- [ ] NEW ROW [[qntm:9]]", "- [ ] a [[qntm:1]]", "- [ ] b [[qntm:2]]"].join("\n");
    const instruction = settle.take(stamped, "demo");
    assert.notEqual(instruction, null, "a still-correct placement must survive an appended stamp");
    assert.deepEqual(instruction.placement, { lineIndex: 1, beforeLineIndex: 2 });
  });

  test("a different view id than the one armed returns null", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: null });
    assert.equal(settle.take(SOURCE, "other-view"), null);
  });

  test("a source in which the armed row was DELETED returns null — refused, never guessed", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" belongs before "a"
    const withoutC = ["## Queue", "- [ ] a [[qntm:1]]", "- [ ] b [[qntm:2]]"].join("\n");
    assert.equal(settle.take(withoutC, "demo"), null, "a row that cannot be found must not be guessed at");
  });

  test("a source in which the TARGET (\"before\") row was deleted returns null — \"before WHAT\" has no answer", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" belongs before "a"
    const withoutA = ["## Queue", "- [ ] b [[qntm:2]]", "- [ ] c [[qntm:3]]"].join("\n");
    assert.equal(settle.take(withoutA, "demo"), null, "the moving row survives, but its target vanished");
  });

  test("a stale take() attempt does not corrupt the still-armed instruction for the RIGHT source", () => {
    // THE REGRESSION THIS GUARDS: a naive `take()` that cleared its own state on ANY call — matched
    // or not — would make the correct call right after a wrong one see nothing armed.
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    assert.equal(settle.take(SOURCE, "other-view"), null, "the mismatched call");
    const instruction = settle.take(SOURCE, "demo");
    assert.notEqual(instruction, null, "the matching call must still see the armed instruction");
    assert.deepEqual(instruction.placement, { lineIndex: 1, beforeLineIndex: 2 });
  });

  test("once a NEW placement is armed, the OLD one can never resurface — no leak across a second commit", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // "a" before "b"
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" before "a" — a NEWER claim
    const instruction = settle.take(SOURCE, "demo");
    assert.deepEqual(instruction.placement, { lineIndex: 3, beforeLineIndex: 1 }, "only the newest arm may answer");
  });
});

describe("3. ONE-SHOT ANIMATION, STICKY POSITION", () => {
  test("the first take() of an armed instruction animates; every later one of the SAME instruction does not", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: null });
    const first = settle.take(SOURCE, "demo");
    const second = settle.take(SOURCE, "demo");
    const third = settle.take(SOURCE, "demo");
    assert.equal(first.animate, true, "the first repaint must be the one that shows the motion");
    assert.equal(second.animate, false, "a repeat repaint must not replay the slide");
    assert.equal(third.animate, false, "nor a third");
    // AND THE POSITION IS STILL RETURNED EVERY TIME — the row must stay placed across incidental
    // repaints (a `j`/`k`, a mode change) even though the animation itself is shown only once.
    assert.deepEqual(second.placement, { lineIndex: 3, beforeLineIndex: null });
    assert.deepEqual(third.placement, { lineIndex: 3, beforeLineIndex: null });
  });
});

describe("4. A SECOND arm() REPLACES THE FIRST, EVEN UNTAKEN — one pending settle, like one cursor", () => {
  test("arming twice before any take() leaves only the SECOND instruction reachable", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: null });
    const instruction = settle.take(SOURCE, "demo");
    assert.deepEqual(instruction.placement, { lineIndex: 3, beforeLineIndex: null });
  });

  test("re-arming the SAME instruction resets the one-shot animation flag", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    settle.take(SOURCE, "demo"); // consumes the animation
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // a fresh commit, same placement
    const instruction = settle.take(SOURCE, "demo");
    assert.equal(instruction.animate, true, "a fresh arm() is a fresh admission and must animate again");
  });
});

describe('5. supersede — a second commit to the armed row discards it before it can fire a stale motion', () => {
  test("editing the row currently armed (found at the given lineIndex) discards the arm", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" armed to move before "a"
    // The operator edits "c" again — `commit.source`/`commit.lineIndex` are the file and the
    // position exactly as `commitLine` would pass them: BEFORE this second edit landed.
    settle.supersede(SOURCE, "demo", 3);
    assert.equal(settle.take(SOURCE, "demo"), null, "a same-row re-edit must discard the standing arm");
  });

  test("editing a DIFFERENT row leaves the standing arm untouched", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" armed
    settle.supersede(SOURCE, "demo", 2); // "b" was edited, not "c"
    const instruction = settle.take(SOURCE, "demo");
    assert.notEqual(instruction, null, "an unrelated row's edit must not discard the arm");
    assert.deepEqual(instruction.placement, { lineIndex: 3, beforeLineIndex: 1 });
  });

  test("supersede on a view it was not armed for is a no-op", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    settle.supersede(SOURCE, "other-view", 3);
    const instruction = settle.take(SOURCE, "demo");
    assert.notEqual(instruction, null, "a different view's own edit must not reach this view's arm");
  });

  test("supersede when nothing is armed is a no-op — it never throws", () => {
    const settle = new SettleSurface();
    assert.doesNotThrow(() => settle.supersede(SOURCE, "demo", 1));
  });
});
