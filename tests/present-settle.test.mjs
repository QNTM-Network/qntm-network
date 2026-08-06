/**
 * SETTLE SURFACE — proof for app/present/settle.ts, roadmap-the-road-ahead.md step 3.
 *
 *   node --test tests/present-settle.test.mjs
 *
 * PURE unit tests of the class alone — no DOM, no `app/index.html` wiring (that is
 * `tests/app-ordering-note.test.mjs`), no painter (that is `tests/present-paint-settle.test.mjs`).
 *
 * ── SIX SECTIONS, REWRITTEN AGAIN 2026-08-06 — MANY PENDING PLACEMENTS, NOT ONE ──
 *
 * `SettleSurface` used to key an armed placement on the EXACT source string it was computed from —
 * `take` refused the instant that string was not byte-identical (fixed once already, same day: the
 * identity key). It ALSO used to hold exactly one pending placement at a time, and a second, wholly
 * unrelated `arm()` — for a DIFFERENT row — discarded whatever the first one was holding, even
 * though the first row's own placement was still correct. `tests/app-settle-wiring.test.mjs` §8
 * reproduces this live: `o`/type/Enter a row that sorts first, then IMMEDIATELY a second, unrelated
 * `o`/type/Enter — the first row visibly reverts to raw file order the moment the second commits.
 * `#pending` is now a map, keyed by the row's own identity, so an arm for one row never touches
 * another's. §4 below is the section most directly rewritten by this: it used to pin "arming twice
 * leaves only the SECOND instruction reachable" as the CORRECT behaviour for two arms naming
 * DIFFERENT rows — that was the bug, encoded as a passing test, and is corrected here to what a
 * second, unrelated arm must now do (both, independently, survive) alongside what a second arm for
 * the SAME row must still do (replace).
 *
 *   1. ARM THEN TAKE — the basic contract: what was armed is what `take` returns, for the row it
 *      names, in the exact `source`/`view` it was armed against. `take` returns a LIST now — these
 *      tests destructure the one element they expect.
 *   2. IDENTITY-KEYED STALENESS — a placement SURVIVES a later source that changes nothing about
 *      the armed row's own identity (the stamp-arrival case the identity key exists for) and is
 *      DISCARDED the moment the row genuinely cannot be re-found — a view mismatch, the row
 *      deleted, or a second, SAME-ROW arm superseding the first.
 *   3. ONE-SHOT ANIMATION, STICKY POSITION — the first `take()` for an armed instruction answers
 *      `animate: true`; every subsequent `take()` of the SAME still-live instruction answers
 *      `animate: false` while still returning the placement (the row stays put; only the motion
 *      is not replayed).
 *   4. MANY PENDING PLACEMENTS — a second `arm()` for a DIFFERENT row leaves BOTH reachable; a
 *      second `arm()` for the SAME row (by identity) still replaces just that one, even untaken —
 *      the one case "there is one cursor" ever correctly described.
 *   5. `supersede` — A SECOND COMMIT TO THE ARMED ROW DISCARDS ONLY THAT ROW'S OWN ENTRY, BEFORE IT
 *      CAN FIRE A STALE MOTION. `settle.ts`'s own header names this the third discard condition;
 *      this section is its direct proof, isolated from `commitLine`'s own wiring (that composition
 *      is `tests/app-settle-wiring.test.mjs` §3), and proves an UNRELATED row's own entry survives.
 *   6. THE BOUND — `#pending` never holds two entries for the same physical row, however many times
 *      it is re-armed, so its size cannot exceed the number of distinct rows the view has.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SettleSurface } from "../dist/present.js";

/** A flat, stamped, three-row section — every sibling already carries `[[qntm:N]]`, the shape
 * `ordering.ts`'s own header records as the common real case for an EXISTING row being reordered. */
const SOURCE = ["## Queue", "- [ ] a [[qntm:1]]", "- [ ] b [[qntm:2]]", "- [ ] c [[qntm:3]]"].join("\n");

describe("1. arm then take — the basic contract", () => {
  test("take() for the exact source/view armed returns the placement, unset, as the only element", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 1);
    assert.deepEqual(instructions[0], {
      placement: { lineIndex: 1, beforeLineIndex: 2 },
      animate: true,
    });
  });

  test("a beforeLineIndex of null (last position) round-trips exactly", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: null });
    const [instruction] = settle.take(SOURCE, "demo");
    assert.deepEqual(instruction.placement, { lineIndex: 3, beforeLineIndex: null });
  });

  test("take() before anything is ever armed returns an empty list", () => {
    const settle = new SettleSurface();
    assert.deepEqual(settle.take("anything", "demo"), []);
  });

  test("arm() against a blank or out-of-range line arms nothing — a defensive floor, not a live path", () => {
    // `orderingPlacementFor` never returns a blank line's index (no marker value to rank a blank
    // line by), so this is unrealistic input — but `instanceAnchorFor` answers `null` for it, and
    // `arm` must not pretend it has an identity to hold onto.
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 99, beforeLineIndex: null });
    assert.deepEqual(settle.take(SOURCE, "demo"), [], "an unresolvable moving row must arm nothing");
  });
});

describe("2. IDENTITY-KEYED STALENESS — survives what does not touch the row, refuses what does", () => {
  test("a later source that ONLY appends a stamp to the armed row's own line still resolves — the exact regression the identity key fixes", () => {
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
    const [instruction] = settle.take(stamped, "demo");
    assert.notEqual(instruction, undefined, "a still-correct placement must survive an appended stamp");
    assert.deepEqual(instruction.placement, { lineIndex: 1, beforeLineIndex: 2 });
  });

  test("a different view id than the one armed returns an empty list", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: null });
    assert.deepEqual(settle.take(SOURCE, "other-view"), []);
  });

  test("a source in which the armed row was DELETED returns an empty list — refused, never guessed", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" belongs before "a"
    const withoutC = ["## Queue", "- [ ] a [[qntm:1]]", "- [ ] b [[qntm:2]]"].join("\n");
    assert.deepEqual(settle.take(withoutC, "demo"), [], "a row that cannot be found must not be guessed at");
  });

  test("a source in which the TARGET (\"before\") row was deleted returns an empty list — \"before WHAT\" has no answer", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" belongs before "a"
    const withoutA = ["## Queue", "- [ ] b [[qntm:2]]", "- [ ] c [[qntm:3]]"].join("\n");
    assert.deepEqual(settle.take(withoutA, "demo"), [], "the moving row survives, but its target vanished");
  });

  test("a stale take() attempt does not corrupt the still-armed instruction for the RIGHT source", () => {
    // THE REGRESSION THIS GUARDS: a naive `take()` that cleared its own state on ANY call — matched
    // or not — would make the correct call right after a wrong one see nothing armed.
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    assert.deepEqual(settle.take(SOURCE, "other-view"), [], "the mismatched call");
    const [instruction] = settle.take(SOURCE, "demo");
    assert.notEqual(instruction, undefined, "the matching call must still see the armed instruction");
    assert.deepEqual(instruction.placement, { lineIndex: 1, beforeLineIndex: 2 });
  });

  test("once a NEW placement is armed for the SAME row, the OLD one for that row can never resurface", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 2 }); // "c" before "b" — a first claim
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" before "a" — a NEWER claim, same row
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 1, "the same physical row must never hold two entries");
    assert.deepEqual(instructions[0].placement, { lineIndex: 3, beforeLineIndex: 1 }, "only the newest arm for this row may answer");
  });
});

describe("3. ONE-SHOT ANIMATION, STICKY POSITION", () => {
  test("the first take() of an armed instruction animates; every later one of the SAME instruction does not", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: null });
    const [first] = settle.take(SOURCE, "demo");
    const [second] = settle.take(SOURCE, "demo");
    const [third] = settle.take(SOURCE, "demo");
    assert.equal(first.animate, true, "the first repaint must be the one that shows the motion");
    assert.equal(second.animate, false, "a repeat repaint must not replay the slide");
    assert.equal(third.animate, false, "nor a third");
    // AND THE POSITION IS STILL RETURNED EVERY TIME — the row must stay placed across incidental
    // repaints (a `j`/`k`, a mode change) even though the animation itself is shown only once.
    assert.deepEqual(second.placement, { lineIndex: 3, beforeLineIndex: null });
    assert.deepEqual(third.placement, { lineIndex: 3, beforeLineIndex: null });
  });
});

describe("4. MANY PENDING PLACEMENTS — a second arm() for a DIFFERENT row keeps BOTH; for the SAME row, replaces it", () => {
  test("THE FIX, DIRECTLY: arming a placement for row \"a\" and then, separately, for row \"c\" — an unrelated row — leaves BOTH reachable at once", () => {
    // This is `tests/app-settle-wiring.test.mjs` §8's live reproduction, at the unit level: two
    // unrelated captures in a row must not make the second discard the first.
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // "a" before "b"
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" before "a" — a DIFFERENT row
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 2, `expected both rows' placements to survive, got: ${JSON.stringify(instructions)}`);
    const forA = instructions.find((i) => i.placement.lineIndex === 1);
    const forC = instructions.find((i) => i.placement.lineIndex === 3);
    assert.deepEqual(forA?.placement, { lineIndex: 1, beforeLineIndex: 2 }, "\"a\"'s own placement must still be there");
    assert.deepEqual(forC?.placement, { lineIndex: 3, beforeLineIndex: 1 }, "\"c\"'s own placement must still be there");
  });

  test("arming the SAME row twice before any take() leaves only the SECOND instruction for THAT row reachable", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // "a" before "b"
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: null }); // "a" again — a newer claim, SAME row
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 1, "the same row must never hold two entries");
    assert.deepEqual(instructions[0].placement, { lineIndex: 1, beforeLineIndex: null });
  });

  test("re-arming the SAME instruction resets the one-shot animation flag for THAT row only", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // a second, unrelated row
    settle.take(SOURCE, "demo"); // consumes both animations
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // a fresh commit, same placement, row "a"
    const instructions = settle.take(SOURCE, "demo");
    const forA = instructions.find((i) => i.placement.lineIndex === 1);
    const forC = instructions.find((i) => i.placement.lineIndex === 3);
    assert.equal(forA?.animate, true, "a fresh arm() is a fresh admission and must animate again");
    assert.equal(forC?.animate, false, "row \"c\"'s own instruction was not re-armed and must not replay");
  });

  test("a view change clears every pending row, not only the one about to be armed", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 });
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    // A commit lands in a DIFFERENT view — the only way `arm()` is ever called for a view other than
    // the one currently held (a real page only ever commits in `currentViewId`).
    const otherSource = ["## Other", "- [ ] x [[qntm:9]]"].join("\n");
    settle.arm(otherSource, "other-view", { lineIndex: 1, beforeLineIndex: null });
    assert.deepEqual(settle.take(SOURCE, "demo"), [], "the old view's placements must not resurface");
    const [instruction] = settle.take(otherSource, "other-view");
    assert.deepEqual(instruction.placement, { lineIndex: 1, beforeLineIndex: null });
  });
});

describe('5. supersede — a second commit to the armed row discards ONLY that row, before it can fire a stale motion', () => {
  test("editing the row currently armed (found at the given lineIndex) discards that row's own arm", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" armed to move before "a"
    // The operator edits "c" again — `commit.source`/`commit.lineIndex` are the file and the
    // position exactly as `commitLine` would pass them: BEFORE this second edit landed.
    settle.supersede(SOURCE, "demo", 3);
    assert.deepEqual(settle.take(SOURCE, "demo"), [], "a same-row re-edit must discard the standing arm");
  });

  test("editing a DIFFERENT row leaves the standing arm untouched, even with another row also pending", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" armed
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // "a" ALSO armed, unrelated
    settle.supersede(SOURCE, "demo", 2); // "b" was edited, not "c" or "a"
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 2, "an unrelated row's edit must not discard either standing arm");
  });

  test("superseding one of two pending rows discards ONLY that one, leaving the other reachable", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 }); // "c" armed
    settle.arm(SOURCE, "demo", { lineIndex: 1, beforeLineIndex: 2 }); // "a" ALSO armed, unrelated
    settle.supersede(SOURCE, "demo", 3); // "c" is re-edited
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 1, "only \"c\"'s own entry may be discarded");
    assert.deepEqual(instructions[0].placement, { lineIndex: 1, beforeLineIndex: 2 }, "\"a\"'s own entry must survive");
  });

  test("supersede on a view it was not armed for is a no-op", () => {
    const settle = new SettleSurface();
    settle.arm(SOURCE, "demo", { lineIndex: 3, beforeLineIndex: 1 });
    settle.supersede(SOURCE, "other-view", 3);
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(instructions.length, 1, "a different view's own edit must not reach this view's arm");
  });

  test("supersede when nothing is armed is a no-op — it never throws", () => {
    const settle = new SettleSurface();
    assert.doesNotThrow(() => settle.supersede(SOURCE, "demo", 1));
  });
});

describe("6. THE BOUND — the pending set can never exceed one entry per distinct row", () => {
  test("re-arming the same three rows, in every order, ten times over, never grows past three entries", () => {
    const settle = new SettleSurface();
    const placements = [
      { lineIndex: 1, beforeLineIndex: 2 },
      { lineIndex: 2, beforeLineIndex: 3 },
      { lineIndex: 3, beforeLineIndex: 1 },
    ];
    for (let round = 0; round < 10; round++) {
      for (const placement of placements) {
        settle.arm(SOURCE, "demo", placement);
      }
    }
    const instructions = settle.take(SOURCE, "demo");
    assert.equal(
      instructions.length,
      3,
      `re-arming the same 3 rows repeatedly must never accumulate more than 3 pending entries, got: ${JSON.stringify(instructions)}`,
    );
  });
});
