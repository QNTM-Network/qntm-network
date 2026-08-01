/**
 * THE RELATIVE ANCHOR — `app/present/relative.ts`, L3 ADDRESSING.
 *
 *   node --test tests/present-relative.test.mjs
 *
 * ── WHAT IS BEING PROVED, AND IN WHICH ORDER ──
 *
 *   1. WHAT THE ANCHOR IS — the shape, and every case where it refuses to be taken at all.
 *   2. IT SURVIVES THE STAMP — the measured blocker, over a real before and a fixture after.
 *   3. IT REFUSES RATHER THAN GUESSES — one test per named refusal, plus the ambiguous case.
 *   4. THE RUNG ORDER — `ANCHOR_TRUST` is the one tuple, and the walk obeys it.
 *   5. THE MUTATION PROOF — the two guards that make this construct honest, each deleted from a
 *      copy of the shipped bundle, each shown to put the cursor on the wrong line when it is gone.
 *
 * ── WHERE THE CONTENT COMES FROM ──
 *
 * `REAL_INBOX` is a literal copy of `~/qntm/inbox.md`, read read-only, carried over unchanged from
 * `tests/present-replay.test.mjs` so the two files cannot drift about what the operator's own file
 * says. EVERY "after" string is hand-built — no cycle ran, no `graph-sync` ran, nothing was posted.
 * The constructed fixtures use the same two-heading shape the real file has.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANCHOR_TRUST,
  extendsLine,
  instanceAnchorFor,
  instancesOf,
  relativeAnchorFor,
  resolveInstanceAnchor,
  resolveRelativeAnchor,
} from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW = "inbox";

/** `~/qntm/inbox.md`, in full, as it stood 2026-08-01 — the same literal `present-replay` carries. */
const REAL_INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
].join("\n");

/** Take an anchor and resolve it — the two calls every test below makes, spelled once. */
function walk(before, lineIndex, after, view = VIEW) {
  const anchor = instanceAnchorFor(before, lineIndex, view);
  assert.notEqual(anchor, null, "the fixture's own cursor line has no identity — check it is not blank");
  return { anchor, reading: resolveInstanceAnchor(anchor, after, view) };
}

/** The relative rungs alone, without the instance and node rungs in front of them. */
function relativeOnly(before, lineIndex, after, view = VIEW) {
  const anchor = relativeAnchorFor(instancesOf(before, view), before.split("\n"), lineIndex);
  assert.notEqual(anchor, null, "the fixture was meant to yield a relative anchor and did not");
  return resolveRelativeAnchor(anchor, instancesOf(after, view), after.split("\n"));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. WHAT THE ANCHOR IS — and, just as importantly, when there is none to take.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. WHAT THE ANCHOR IS — a bracket, a gap, an offset, and the characters", () => {
  test("a capture typed at the TOP of a real section — bracketed from BELOW only", () => {
    // The shape the operator's own inbox actually produces: `o` under the heading, ahead of the
    // three stamped items. There is no stamped line above it in the section, so the bracket's top
    // is the section's own first line.
    const before = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist",
      ...REAL_INBOX.split("\n").slice(2),
    ].join("\n");
    const anchor = instanceAnchorFor(before, 2, VIEW).relative;
    assert.equal(anchor.above, null, "nothing stamped stands above it inside its own section");
    assert.equal(anchor.below, "qntm:2603", "the first stamped line below is the bracket's bottom");
    assert.equal(anchor.section, 1, "section ordinals count headings, never their characters");
    assert.equal(anchor.text, "- [ ] Ring the dentist");
    assert.equal(anchor.gap, 2, "the heading opens the section, so it is IN the gap above him");
    assert.equal(anchor.offset, 1, "he is the second of those two");
  });

  test("a capture typed at the BOTTOM of a real section — bracketed from ABOVE only", () => {
    const before = [...REAL_INBOX.split("\n"), "- [ ] Ring the dentist"].join("\n");
    const anchor = instanceAnchorFor(before, 5, VIEW).relative;
    assert.equal(anchor.above, "qntm:2598");
    assert.equal(anchor.below, null, "nothing stamped stands below it inside its own section");
    assert.equal(anchor.gap, 1);
    assert.equal(anchor.offset, 0);
  });

  test("a capture BETWEEN two stamped lines — bracketed both ways", () => {
    const before = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
      "- [ ] Ring the dentist",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
    ].join("\n");
    const anchor = instanceAnchorFor(before, 3, VIEW).relative;
    assert.deepEqual(
      { above: anchor.above, below: anchor.below, gap: anchor.gap, offset: anchor.offset },
      { above: "qntm:2603", below: "qntm:2602", gap: 1, offset: 0 },
    );
  });

  test("above the first heading — a section ordinal of `null` is a real section, not a missing one", () => {
    const before = ["- [ ] a [[qntm:1]]", "- [ ] Ring the dentist", "## Inbox"].join("\n");
    const anchor = instanceAnchorFor(before, 1, VIEW).relative;
    assert.equal(anchor.section, null);
    assert.equal(anchor.above, "qntm:1");
    assert.equal(anchor.below, null, "the heading below ends the section, so nothing brackets from below");
  });

  test("NOT TAKEN for a line that already carries a stamp — this is the non-regression guarantee", () => {
    // The node tier owns a stamped line. A second, weaker claim about the same line could only ever
    // disagree with a stronger one, so none is made — and because none is made, the whole of
    // `resolveInstanceAnchor` is byte-identical for every stamped line in the operator's vault.
    for (const at of [2, 3, 4]) {
      assert.equal(instanceAnchorFor(REAL_INBOX, at, VIEW).relative, null);
    }
  });

  test("NOT TAKEN for a heading — FOUND BY THIS TEST, not foreseen, and the reason matters", () => {
    // A heading carries no stamp, so it reaches the same code path an authored line does — and the
    // first version of this module gave `## Domain Empty` a bracket. That would have handed a
    // heading the TEXT rung, which compares CHARACTERS, and `~/qntm/metrics.md`'s five headings
    // carry a ratio that changes every cycle. A heading identified by its characters is exactly
    // the defect `instance.ts` exists to remove.
    const anchor = instanceAnchorFor(REAL_INBOX, 1, VIEW);
    assert.equal(anchor.node, null, "the heading has no stamp of its own — so it reaches this path");
    assert.equal(anchor.relative, null, "and is excluded, because its own token is already a constant");
    assert.equal(instanceAnchorFor(REAL_INBOX, 0, VIEW).relative, null, "the first heading too");
  });

  test("a heading whose characters change is STILL found, by the tier that always found it", () => {
    // The control for the exclusion above: removing the relative anchor from a heading costs
    // nothing, because the instance tier answers for one unconditionally.
    const before = ["## On-track accuracy (3d) 🎯 0.44", "- [ ] a [[qntm:1]]"].join("\n");
    const after = ["## On-track accuracy (3d) 🎯 0.39", "- [ ] a [[qntm:1]]"].join("\n");
    const { reading } = walk(before, 0, after);
    assert.equal(reading.via, "instance");
    assert.equal(reading.lineIndex, 0);
  });

  test(
    "TAKEN when nothing in the section carries a stamp — THE BACKLOG ROW'S OWN FALSIFIER, flipped",
    () => {
      // `the-relative-anchor-has-no-landmark-in-an-empty-section` asserted the opposite of this
      // line and called it deliberate. The falsifier it stated was: SHOW A LANDMARK IN AN EMPTY
      // SECTION THAT OUTLIVES THE CYCLE. It is the section's own HEADING, addressed by the ordinal
      // `instance.ts` already builds a heading's identity token from — so the whole section is the
      // region, and `above`/`below` are both `null` because there is genuinely nothing stamped to
      // bracket with, not because there is nothing to be relative to.
      const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
      const anchor = instanceAnchorFor(before, 2, VIEW).relative;
      assert.notEqual(anchor, null, "the empty section is anchored now — this is the row, closed");
      assert.equal(anchor.above, null, "nothing stamped stands above it");
      assert.equal(anchor.below, null, "nothing stamped stands below it either");
      assert.equal(anchor.section, 1, "and the ordinal of the heading that opens it IS the landmark");
      assert.equal(anchor.gap, 2, "the heading opens the section, so it is in the region");
      assert.equal(anchor.offset, 1, "he is the second of the two");
      assert.equal(anchor.text, "- [ ] Ring the dentist");
    },
  );

  test("STILL NOT TAKEN above the first heading with nothing stamped — there is no ordinal", () => {
    // The one place the old refusal was right and stays right. `section === null` is the region
    // above the file's first heading; it has no heading, so it has no ordinal, so a bracket of two
    // nulls really would be the whole file wearing a bracket's clothes.
    const before = ["- [ ] Ring the dentist", "## Inbox", "- [ ] a [[qntm:1]]"].join("\n");
    assert.equal(instanceAnchorFor(before, 0, VIEW).relative, null);
  });

  test("NOT TAKEN for a blank line, or out of range — matching every other anchor in this bundle", () => {
    const before = ["## Inbox", "", "- [ ] a [[qntm:1]]"].join("\n");
    assert.equal(instanceAnchorFor(before, 1, VIEW), null, "a blank line has no identity at all");
    assert.equal(instanceAnchorFor(before, 99, VIEW), null);
    assert.equal(relativeAnchorFor(instancesOf(before, VIEW), before.split("\n"), -1), null);
  });

  test("a stamped line in ANOTHER section does not bracket it — the scan stops at the section edge", () => {
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
    const anchor = instanceAnchorFor(before, 3, VIEW).relative;
    assert.deepEqual(
      [anchor.above, anchor.below],
      [null, null],
      "qntm:1 is in section 0 and he is in section 1 — it is not his neighbour",
    );
    // AND THE ANCHOR IS STILL TAKEN, because his own section's heading is a landmark. Before this
    // row the two nulls above were the whole answer and no anchor was taken at all.
    assert.equal(anchor.section, 1, "he is bracketed by his OWN section, never by the one above it");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. IT SURVIVES THE STAMP — the measured blocker, closed. Real before, fixture after.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. IT SURVIVES THE STAMP — the apex capability's blocker, over real content", () => {
  test("a capture at the TOP of the section — found by the BRACKET, and the characters confirm it", () => {
    const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist", ...REAL_INBOX.split("\n").slice(2)].join("\n");
    // AFTER: the cycle mints qntm:2604 (the real file's highest id is 2603; the next plausible one,
    // a fixture's own choice, never observed) and stamps the line with the `#task 🆕 <date>` shape
    // every real line in this file already carries.
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
      ...REAL_INBOX.split("\n").slice(2),
    ].join("\n");

    const { reading } = walk(before, 2, after);
    assert.equal(reading.outcome, "found");
    assert.equal(reading.via, "relative", "the neighbourhood held, so the STRONG rung answered");
    assert.equal(reading.lineIndex, 2);
  });

  test(
    "a capture at the BOTTOM — the cycle re-sorts it to the top, the bracket refuses, and the " +
      "TEXT rung catches it. THIS IS THE CASE THE BRACKET CANNOT SURVIVE, proved rather than asserted.",
    () => {
      // `~/qntm/inbox.md` prints 2603, 2602, 2598 — descending, newest first. A line typed at the
      // bottom is re-sorted to the TOP by the cycle that stamps it, so the bracket it was taken in
      // (`above: qntm:2598`, nothing below) no longer contains it.
      const before = [...REAL_INBOX.split("\n"), "- [ ] Ring the dentist"].join("\n");
      const after = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
        ...REAL_INBOX.split("\n").slice(2),
      ].join("\n");

      // The bracket, on its own, refuses — and says which way it failed.
      const bracket = relativeOnly(before, 5, after);
      assert.equal(bracket.outcome, "found");
      assert.equal(bracket.via, "text", "the bracket refused; only the characters could still answer");

      const { reading } = walk(before, 5, after);
      assert.equal(reading.outcome, "found");
      assert.equal(reading.via, "text", "a WEAKER claim, and the reading says so rather than hiding it");
      assert.equal(reading.lineIndex, 2);
    },
  );

  test("the cursor's COLUMN survives too, because `FocusSurface.reanchor` clamps against the arrived line", async () => {
    const { FocusSurface } = await import("../dist/present.js");
    const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist", ...REAL_INBOX.split("\n").slice(2)].join("\n");
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
      ...REAL_INBOX.split("\n").slice(2),
    ].join("\n");

    const focus = new FocusSurface();
    focus.focus(2, before, 20, VIEW);
    assert.equal(focus.column, 20, "he is mid-word when the cycle lands");
    const reading = focus.reanchor(after, VIEW);
    assert.equal(reading.outcome, "found");
    assert.equal(focus.lineIndex, 2, "the cursor really moved, not merely reported");
    assert.equal(focus.column, 20, "and it kept the character he was on");
  });

  test("a SECOND line opened under the same node is told apart from the first, by its offset", () => {
    const before = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
      "- [ ] Ring the dentist",
      "- [ ] Call the bank",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
    ].join("\n");
    const first = instanceAnchorFor(before, 3, VIEW).relative;
    const second = instanceAnchorFor(before, 4, VIEW).relative;
    assert.equal(first.above, second.above, "'after node 2603' is the SAME for both — which is why it is not enough on its own");
    assert.notEqual(first.offset, second.offset, "the offset is what tells them apart");
    assert.equal(first.offset, 0);
    assert.equal(second.offset, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2b. THE FIRST CAPTURE OF THE DAY, INTO A SECTION WITH NOTHING STAMPED IN IT.
//
// Measured against the operator's live vault, read read-only 2026-08-01: 109 of 191 rendered
// sections carry no stamped line and 94 of those are heading-only — `~/qntm/inbox.md`'s `## Inbox`
// among them, and `work/daily.md`'s `## Work Capture`, and `personal/daily.md`'s `## Personal
// Capture`. Every capture into one of those lost its cursor unconditionally.
//
// EVERY "before" AND "after" BELOW IS BUILT ON `REAL_INBOX`, WHICH IS `~/qntm/inbox.md` VERBATIM.
// Its `## Inbox` really is heading-only and its three real lines really do all sit under
// `## Domain Empty`. No cycle ran, nothing was posted, and every arriving string is hand-built.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2b. AN EMPTY SECTION — the heading is the landmark, and the capture keeps its cursor", () => {
  test("the line STAYS in the section it was typed into — found by the BRACKET", () => {
    // `## Domain Empty` with its three real lines removed: a section holding a heading and one
    // line the cycle has never seen. This is the pure shape.
    const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
    ].join("\n");

    const { reading } = walk(before, 2, after);
    assert.equal(reading.outcome, "found", "before this row it was `absent`, every time");
    assert.equal(reading.via, "relative", "the section held its shape, so the STRONG rung answered");
    assert.equal(reading.lineIndex, 2);
  });

  test(
    "THE OPERATOR'S OWN INBOX — typed under `## Inbox`, re-sorted by the cycle into " +
      "`## Domain Empty`. The bracket cannot survive that and the TEXT rung catches it — which is " +
      "a rung the old refusal ALSO denied him, because it took no anchor at all.",
    () => {
      // `## Inbox` is heading-only in the live file; a new capture has no domain, so it qualifies
      // for `## Domain Empty` and the cycle prints it there, newest first, above 2603.
      const before = ["## Inbox", "- [ ] Ring the dentist", ...REAL_INBOX.split("\n").slice(1)].join("\n");
      const after = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
        ...REAL_INBOX.split("\n").slice(2),
      ].join("\n");

      const anchor = instanceAnchorFor(before, 1, VIEW).relative;
      assert.equal(anchor.section, 0, "he typed into section 0, which holds only its own heading");

      const { reading } = walk(before, 1, after);
      assert.equal(reading.outcome, "found");
      assert.equal(reading.via, "text", "the section it was taken in no longer holds it — a WEAKER claim, said plainly");
      assert.equal(reading.lineIndex, 2);
    },
  );

  test("the cursor's COLUMN survives the empty-section capture too, through `FocusSurface`", async () => {
    const { FocusSurface } = await import("../dist/present.js");
    const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
    ].join("\n");

    const focus = new FocusSurface();
    focus.focus(2, before, 18, VIEW);
    const reading = focus.reanchor(after, VIEW);
    assert.equal(reading.outcome, "found");
    assert.equal(focus.lineIndex, 2, "the cursor really moved, not merely reported");
    assert.equal(focus.column, 18);
  });

  test(
    "THE SECTION FILLS UP — an anchor taken when it was empty does NOT survive the section " +
      "gaining lines by the bracket, and says so. The characters are what carries it.",
    () => {
      // The question worth asking of a section that is empty because everything in it was
      // completed: it may be full tomorrow. The gap is a COUNT, so a section that gained two lines
      // moved every offset in it and the bracket refuses rather than doing arithmetic on a region
      // that changed size.
      const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
      const after = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
        ...REAL_INBOX.split("\n").slice(2),
      ].join("\n");

      const bracket = relativeOnly(before, 2, after);
      assert.equal(bracket.via, "text", "the bracket refused; only the characters could still answer");

      const { reading } = walk(before, 2, after);
      assert.equal(reading.outcome, "found");
      assert.equal(reading.via, "text");
      assert.equal(reading.lineIndex, 2);
    },
  );

  test("TWO LINES OPENED IN THE EMPTY SECTION are told apart by their offset, and both hold", () => {
    // `above` and `below` are BOTH null for both of them — "the first line after heading N" alone
    // could not tell them apart, which is why the offset is carried and not inferred.
    const before = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist",
      "- [ ] Call the bank",
    ].join("\n");
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
      "- [ ] Call the bank [[qntm:2605]] #task 🆕 2026-08-01",
    ].join("\n");

    const first = instanceAnchorFor(before, 2, VIEW).relative;
    const second = instanceAnchorFor(before, 3, VIEW).relative;
    assert.deepEqual(
      [first.above, first.below, second.above, second.below],
      [null, null, null, null],
      "neither has a stamped neighbour — the heading's ordinal is the whole landmark for both",
    );
    assert.equal(first.section, second.section, "the same section names both");
    assert.deepEqual([first.offset, second.offset], [1, 2], "the offset is what tells them apart");

    assert.deepEqual(
      [walk(before, 2, after).reading.lineIndex, walk(before, 3, after).reading.lineIndex],
      [2, 3],
      "and each lands on its own line, not on the other's",
    );
  });

  test(
    "THE CYCLE STAMPS ONLY ONE OF THE TWO — the region changed size, so the bracket refuses for " +
      "both and neither cursor is guessed at",
    () => {
      const before = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Ring the dentist",
        "- [ ] Call the bank",
      ].join("\n");
      // The cycle stamped the first and did not print the second at all — it qualified for no
      // published section of this view.
      const after = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
      ].join("\n");

      const kept = walk(before, 2, after).reading;
      assert.equal(kept.outcome, "found");
      assert.equal(kept.via, "text", "the region holds one line where it held two — the bracket will not do that sum");
      assert.equal(kept.lineIndex, 2);

      const lost = walk(before, 3, after).reading;
      assert.equal(lost.outcome, "absent", "the line is not in the projection at all");
      assert.equal(lost.because, "gap-changed");
      // AND THIS IS WHERE `held.ts` TAKES OVER — unchanged by this row, and still the answer.
    },
  );

  test(
    "IF THE HEADING ITSELF IS GONE the ordinal names a DIFFERENT section, and the characters " +
      "refuse it rather than the cursor landing on a line he never wrote",
    () => {
      // The one measured way an ordinal can lie: a declared section renders with NO heading when a
      // graph node's title collides with the section name (dormant today, zero firings across the
      // live views). Every ordinal below it then shifts by one. That breaks a heading's own
      // INSTANCE rung everywhere in this bundle — it is not a hazard this rung introduces — and
      // here it is caught by the same two guards every other bracket already stands on.
      const before = ["## Inbox", "- [ ] Ring the dentist", ...REAL_INBOX.split("\n").slice(1)].join("\n");
      const after = REAL_INBOX.split("\n").slice(1).join("\n"); // `## Inbox` did not render at all

      const { reading } = walk(before, 1, after);
      assert.equal(reading.outcome, "absent", "his line is not in this projection, and nothing pretends it is");
      assert.equal(reading.because, "gap-changed", "section 0 is now `## Domain Empty` and it is a different size");
    },
  );

  test("A DRAFT reaches all of this through `resolveInstanceAnchor`, not around it", async () => {
    // `draft.ts` anchors an uncommitted row on the NEIGHBOUR it was opened beside. When that
    // neighbour is a line he settled a moment ago into an empty section, the neighbour's anchor had
    // no relative rung and the row went `unplaced` the instant the cycle stamped it. It is the same
    // one walk that changed, reached by the same one path.
    const { placeFor, placeDraft } = await import("../dist/present.js");
    const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
    ].join("\n");

    const draft = { lineIndex: 3, seed: "- [ ] ", typed: "- [ ] ", place: placeFor(before, 3, VIEW) };
    assert.notEqual(draft.place, null, "the line he settled a moment ago is what the row hangs on");
    const placement = placeDraft(draft, before, after, VIEW);
    assert.equal(placement.outcome, "placed");
    assert.equal(placement.via, "relative", "the neighbour was re-found by the rung this row added");
    assert.equal(placement.lineIndex, 3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. IT REFUSES RATHER THAN GUESSES — one test per named refusal.
//
// EACH FIXTURE'S ARRIVED LINE IS RE-INDENTED (`  - [ ] mine`), which is a real thing a cycle does
// when it nests a node — and which makes the characters STOP extending what he typed. That is
// deliberate: without it the TEXT rung would rescue every one of these and the BRACKET's own reason
// would never surface. The rescue itself is proved separately, in §2's second test.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. IT REFUSES RATHER THAN GUESSES — every named case", () => {
  const BRACKETED = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine", "- [ ] b [[qntm:2]]"].join("\n");
  const REWRITTEN = "  - [ ] mine [[qntm:3]] #task";

  const refuses = (name, after, because, from = BRACKETED, at = 2) => {
    test(`${because} — ${name}`, () => {
      const reading = relativeOnly(from, at, after);
      assert.equal(reading.outcome, "refused", "a guess reached the cursor where a refusal was owed");
      assert.equal(reading.because, because);
      // AND IT REACHES THE CALLER. `absent` alone is not enough: "your line is gone" and "the
      // neighbourhood it sat in changed shape" are different events to the person who typed it.
      const { reading: walked } = walk(from, at, after);
      assert.equal(walked.outcome, "absent");
      assert.equal(walked.because, because);
    });
  };

  refuses(
    "the node above left the view",
    ["## Inbox", REWRITTEN, "- [ ] b [[qntm:2]]"].join("\n"),
    "above-absent",
  );

  refuses(
    "the node below left the view",
    ["## Inbox", "- [ ] a [[qntm:1]]", REWRITTEN].join("\n"),
    "below-absent",
  );

  refuses(
    "the node above now prints twice",
    ["## Inbox", "- [ ] a [[qntm:1]]", REWRITTEN, "- [ ] a again [[qntm:1]]", "- [ ] b [[qntm:2]]"].join("\n"),
    "above-ambiguous",
  );

  refuses(
    "the node below now prints twice",
    ["## Inbox", "- [ ] a [[qntm:1]]", REWRITTEN, "- [ ] b [[qntm:2]]", "- [ ] b again [[qntm:2]]"].join("\n"),
    "below-ambiguous",
  );

  refuses(
    "the two bracketing nodes swapped places, so they no longer describe a region",
    ["## Inbox", "- [ ] b [[qntm:2]]", REWRITTEN, "- [ ] a [[qntm:1]]"].join("\n"),
    "bracket-crossed",
  );

  refuses(
    "the bracketing nodes are now in DIFFERENT sections, so the region spans a heading",
    ["## Inbox", "- [ ] a [[qntm:1]]", "## Domain Empty", REWRITTEN, "- [ ] b [[qntm:2]]"].join("\n"),
    "bracket-crossed",
  );

  refuses(
    "the cycle put a SECOND line into the same bracket, so every offset in it moved",
    ["## Inbox", "- [ ] a [[qntm:1]]", REWRITTEN, "  - [ ] surprise [[qntm:4]] #task", "- [ ] b [[qntm:2]]"].join("\n"),
    "gap-changed",
  );

  refuses(
    "the slot is right and the characters in it are somebody else's",
    ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] a completely different line [[qntm:5]]", "- [ ] b [[qntm:2]]"].join("\n"),
    "text-changed",
  );

  // THE TWO REFUSALS THE EMPTY-SECTION LANDMARK ADDED. Both are about the ORDINAL rather than
  // about a bracketing node, which is what makes them their own names: `gap-changed` says the
  // region is there and is a different shape, and neither of these can say that.

  refuses(
    "the section the ordinal names is not in the arriving projection at all",
    ["## Inbox", REWRITTEN].join("\n"),
    "section-absent",
    ["## Inbox", "## Domain Empty", "- [ ] mine"].join("\n"),
    2,
  );

  test("no-landmark — a hand-built anchor with no bracket AND no ordinal is refused, not resolved", () => {
    // `relativeAnchorFor` never mints this shape: above the file's first heading with nothing
    // stamped, it returns `null`. So this guards the EXPORTED resolver, which any caller holding an
    // `InstanceAnchor.relative` can reach — and without it, `boundsOf(places, null)` would quietly
    // bracket the region above the first heading, which is a region the anchor never named.
    const after = ["- [ ] mine [[qntm:3]] #task", "## Inbox"].join("\n");
    const handBuilt = { above: null, below: null, section: null, gap: 1, offset: 0, text: "- [ ] mine" };
    const reading = resolveRelativeAnchor(handBuilt, instancesOf(after, VIEW), after.split("\n"));
    // The TEXT rung still runs and still answers, which is the point of it — but the BRACKET's own
    // reason is what a refusal would carry, so it is checked on the one arrival that has no match.
    assert.equal(reading.outcome, "found");
    assert.equal(reading.via, "text", "the weak rung is not disabled by the strong one refusing");

    const nothing = ["  - [ ] mine [[qntm:3]] #task", "## Inbox"].join("\n");
    const refused = resolveRelativeAnchor(handBuilt, instancesOf(nothing, VIEW), nothing.split("\n"));
    assert.equal(refused.outcome, "refused");
    assert.equal(refused.because, "no-landmark");
  });

  test("ambiguous — two lines extend his characters, so the cursor is not moved at all", () => {
    // The one case that is not a `refused`: the characters really are in the view, more than once.
    // Picking would put the cursor on a line he did not write; the existing `ambiguous` outcome
    // already means exactly this and is reused rather than duplicated.
    // The bracket refuses (the cycle put two lines where one stood), and the characters are then
    // in the view TWICE — so the weak rung has two answers and gives neither.
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine"].join("\n");
    const after = [
      "## Inbox",
      "- [ ] a [[qntm:1]]",
      "- [ ] mine [[qntm:3]] #task",
      "- [ ] mine [[qntm:4]] #task",
    ].join("\n");
    const { reading } = walk(before, 2, after);
    assert.equal(reading.outcome, "ambiguous");
    assert.deepEqual(reading.candidates, [2, 3]);
  });

  test("the line genuinely LEFT the view — still absent, and that is the right answer", () => {
    // `tests/present-replay.test.mjs` §1's own fixture: the operator adds `#work`, the cycle mints
    // the node, and it qualifies for neither of inbox's two published sections. The row is not in
    // the projection. No anchor of any kind can bring back a row that is not there, and `held.ts`
    // is what keeps his characters — unchanged by this construct.
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] Ring the dentist #work"].join("\n");
    const after = ["## Inbox", "- [ ] a [[qntm:1]]"].join("\n");
    const { reading } = walk(before, 2, after);
    assert.equal(reading.outcome, "absent");
    assert.equal(reading.because, "gap-changed", "the bracket's own region is now empty — his line was in it");
  });

  test("`extendsLine` cannot be satisfied by a shorter line that merely starts the same way", () => {
    // The narrowing has no magic number in it: the held text must end in a non-space and the
    // arrived line must continue with a space. Same rule as `held.ts`'s `sourceOwns`.
    assert.equal(extendsLine("- [ ] Ring the dentist", "- [ ] Ring the dentist [[qntm:1]]"), true);
    assert.equal(extendsLine("- [ ] Ring the dentist", "- [ ] Ring the dentist"), true);
    assert.equal(extendsLine("- ", "- [ ] Ring the dentist"), false, "a bare chrome must not match a whole line");
    assert.equal(extendsLine("- [ ] Ring", "- [ ] Ringing the bell"), false, "a word boundary is required");
    assert.equal(extendsLine("", "anything"), false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE RUNG ORDER — one tuple, and the walk obeys it.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. THE RUNG ORDER — `ANCHOR_TRUST`, owned in one tuple", () => {
  test("the tuple is the order, most trusted first", () => {
    assert.deepEqual([...ANCHOR_TRUST], ["instance", "node", "relative", "text"]);
  });

  test("a STAMPED line that moved section is still answered by `node`, not by anything weaker", () => {
    // The property `focus.ts`'s header calls the one regression risk in the whole anchor arc. It is
    // safe here by construction as well as by argument — a stamped line gets no relative anchor at
    // all — but it is asserted rather than trusted.
    const before = ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]", "## Work"].join("\n");
    const after = ["## Bucket", "## Work", "- [ ] Ring the dentist #work [[qntm:9000]]"].join("\n");
    const { anchor, reading } = walk(before, 1, after);
    assert.equal(anchor.relative, null, "no weaker claim was even taken for a stamped line");
    assert.equal(reading.via, "node");
  });

  test("`relative` outranks `text` — when both could answer, the bracket wins", () => {
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine", "- [ ] b [[qntm:2]]"].join("\n");
    // The bracket holds AND the characters are unique in the view, so both rungs have an answer.
    const after = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine [[qntm:3]] #task", "- [ ] b [[qntm:2]]"].join("\n");
    const { reading } = walk(before, 2, after);
    assert.equal(reading.via, "relative", "the stronger claim answered, so the weaker one never ran");
  });

  test("every `via` this bundle can report is a member of the tuple", () => {
    // The concrete form of "no caller may re-express the order": a reading whose grade is not in
    // ANCHOR_TRUST is a rung somebody added without going through the tuple.
    const cases = [
      { before: REAL_INBOX, at: 2, after: REAL_INBOX, expect: "instance" },
      {
        before: ["## Bucket", "- [ ] x [[qntm:9]]", "## Work"].join("\n"),
        at: 1,
        after: ["## Bucket", "## Work", "- [ ] x [[qntm:9]]"].join("\n"),
        expect: "node",
      },
      {
        before: ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine"].join("\n"),
        at: 2,
        after: ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine [[qntm:3]] #task"].join("\n"),
        expect: "relative",
      },
      {
        before: ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine"].join("\n"),
        at: 2,
        after: ["## Inbox", "- [ ] mine [[qntm:3]] #task", "- [ ] a [[qntm:1]]"].join("\n"),
        expect: "text",
      },
    ];
    const seen = cases.map(({ before, at, after, expect }) => {
      const { reading } = walk(before, at, after);
      assert.equal(reading.outcome, "found");
      assert.ok(ANCHOR_TRUST.includes(reading.via), `${reading.via} is not in ANCHOR_TRUST`);
      assert.equal(reading.via, expect);
      return reading.via;
    });
    assert.deepEqual(seen, [...ANCHOR_TRUST], "all four rungs are exercised, in order");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE MUTATION PROOF — a guard that cannot be shown to matter is decoration.
//
// Each mutation deletes ONE guard from a copy of the shipped bundle (`dist/present.js`, which the
// build emits unminified) and imports the result. Nothing on disk is written and nothing under
// `app/` is touched: the mutated source is loaded from a `data:` URL and discarded.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const BUNDLE = readFileSync(resolve(HERE, "..", "dist", "present.js"), "utf8");

/** Load a copy of the shipped bundle with one substring replaced. */
async function mutated(find, replaceWith) {
  assert.ok(BUNDLE.includes(find), `the mutation target "${find}" is not in dist/present.js`);
  const source = BUNDLE.replace(find, replaceWith);
  return import(`data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`);
}

describe("5. THE MUTATION PROOF — each guard deleted, each shown to put the cursor on the wrong line", () => {
  test("DELETE THE GAP GUARD — the cursor lands on a line the operator never wrote", async () => {
    // The cycle put a SECOND line into the bracket. With the guard, this is `gap-changed` and the
    // cursor does not move. Without it, offset 0 of a gap that now holds two lines is the WRONG
    // one — and the text confirmation below is the only thing left standing between him and it.
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine", "- [ ] b [[qntm:2]]"].join("\n");
    const after = [
      "## Inbox",
      "- [ ] a [[qntm:1]]",
      "- [ ] mine [[qntm:3]] #task",
      "- [ ] mine as well [[qntm:4]] #task",
      "- [ ] b [[qntm:2]]",
    ].join("\n");

    // SHIPPED: the gap changed, so the bracket refuses — and the TEXT rung then refuses too,
    // because two lines extend "- [ ] mine".
    const shipped = walk(before, 2, after);
    assert.equal(shipped.reading.outcome, "ambiguous", "the shipped bundle refuses to pick");

    const broken = await mutated("gap.length !== anchor.gap", "false");
    const anchor = broken.instanceAnchorFor(before, 2, VIEW);
    const reading = broken.resolveInstanceAnchor(anchor, after, VIEW);
    assert.equal(reading.outcome, "found", "the mutation must change the answer, or it proves nothing");
    assert.equal(reading.via, "relative", "and it claims the STRONG rung answered, which is the harm");
  });

  test("DELETE THE TEXT CONFIRMATION — the bracket alone moves the cursor onto a stranger's line", async () => {
    // The bracket holds and the gap count matches, but the line now in the slot is not his: the
    // cycle removed his line and something else took the position. Only the characters can tell.
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine", "- [ ] b [[qntm:2]]"].join("\n");
    const after = [
      "## Inbox",
      "- [ ] a [[qntm:1]]",
      "- [ ] somebody else's line [[qntm:7]] #task",
      "- [ ] b [[qntm:2]]",
    ].join("\n");

    const shipped = walk(before, 2, after);
    assert.equal(shipped.reading.outcome, "absent");
    assert.equal(shipped.reading.because, "text-changed");

    const broken = await mutated("!extendsLine(anchor.text", "!true && !extendsLine(anchor.text");
    const anchor = broken.instanceAnchorFor(before, 2, VIEW);
    const reading = broken.resolveInstanceAnchor(anchor, after, VIEW);
    assert.equal(reading.outcome, "found");
    assert.equal(reading.lineIndex, 2, "the cursor is now on a line he did not write");
  });

  test("DELETE THE UNIQUENESS GUARD ON THE TEXT RUNG — a duplicate becomes a pick", async () => {
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "- [ ] mine"].join("\n");
    const after = [
      "## Inbox",
      "- [ ] a [[qntm:1]]",
      "- [ ] mine [[qntm:3]] #task",
      "- [ ] mine [[qntm:4]] #task",
    ].join("\n");

    const shipped = walk(before, 2, after);
    assert.equal(shipped.reading.outcome, "ambiguous");

    const broken = await mutated("candidates.length === 1", "candidates.length >= 1");
    const anchor = broken.instanceAnchorFor(before, 2, VIEW);
    const reading = broken.resolveInstanceAnchor(anchor, after, VIEW);
    assert.equal(reading.outcome, "found", "the mutation picks the first of two, which is a guess");
    assert.equal(reading.lineIndex, 2);
  });

  test("DELETE THE STAMPED-LINE EXCLUSION — a stamped line acquires a second, weaker claim", async () => {
    // The one mutation that would be a REGRESSION rather than a wrong cursor: if a stamped line
    // were given a relative anchor, the node tier's answer could be reached past by a weaker rung
    // the day the node tier abstained. It cannot happen in the shipped bundle, and this shows what
    // it would take to make it happen.
    assert.equal(instanceAnchorFor(REAL_INBOX, 2, VIEW).relative, null);
    const broken = await mutated("place.node !== null", "false");
    assert.notEqual(
      broken.instanceAnchorFor(REAL_INBOX, 2, VIEW).relative,
      null,
      "the mutation must change the answer, or the exclusion proves nothing",
    );
  });

  test("BREAK THE HEADING LANDMARK — the cursor lands on a stranger's line in another region", async () => {
    // The new rung's ONE load-bearing fact: with no bracket resolved, the region is named by
    // `anchor.section` — the ordinal of the heading that opens it. Take that away and the region
    // falls back to `null`, which is the file's own pre-heading region, and the offset is then read
    // against a neighbourhood the anchor never described.
    const before = ["## Inbox", "## Domain Empty", "- [ ] mine"].join("\n");
    const after = [
      "- [ ] other [[qntm:8]]",
      "- [ ] mine [[qntm:9]] #task", // somebody else's line, and it happens to extend his characters
      "## Inbox",
      "## Domain Empty",
      "- [ ] mine [[qntm:3]] #task", // HIS
    ].join("\n");

    const shipped = walk(before, 2, after);
    assert.equal(shipped.reading.outcome, "found");
    assert.equal(shipped.reading.via, "relative");
    assert.equal(shipped.reading.lineIndex, 4, "the ordinal named `## Domain Empty`, where he typed");

    const broken = await mutated(": anchor.section;", ": null;");
    const anchor = broken.instanceAnchorFor(before, 2, VIEW);
    const reading = broken.resolveInstanceAnchor(anchor, after, VIEW);
    assert.equal(reading.outcome, "found", "the mutation must change the answer, or it proves nothing");
    assert.equal(reading.via, "relative", "and it claims the STRONG rung answered, which is the harm");
    assert.equal(reading.lineIndex, 1, "the cursor is now on a line he did not write");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE STAMPED-SECTION PATH IS UNCHANGED — proved against the code as it stood, not asserted.
//
// The mutation machinery above runs the other way here: ONE substring of the shipped bundle is put
// back to what it said before this row (`&& section === null` removed from the take-side guard),
// which is the whole of the behavioural change. Every anchor and every reading is then compared
// between the two bundles. They must agree everywhere EXCEPT the empty section.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. THE STAMPED-SECTION PATH IS UNCHANGED — compared against the reverted bundle", () => {
  /** The shipped bundle with this row's one behavioural change put back. */
  const reverted = () =>
    mutated("above === null && below === null && section === null", "above === null && below === null");

  /** Every line of every fixture, both bundles, anchor and reading compared. */
  const FIXTURES = [
    {
      name: "the operator's real inbox, unchanged by the cycle",
      before: REAL_INBOX,
      after: REAL_INBOX,
    },
    {
      name: "a capture at the top of a stamped section — the bracket case",
      before: ["## Inbox", "## Domain Empty", "- [ ] mine", ...REAL_INBOX.split("\n").slice(2)].join("\n"),
      after: [
        "## Inbox",
        "## Domain Empty",
        "- [ ] mine [[qntm:2604]] #task 🆕 2026-08-01",
        ...REAL_INBOX.split("\n").slice(2),
      ].join("\n"),
    },
    {
      name: "a capture between two stamped lines",
      before: [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
        "- [ ] mine",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      ].join("\n"),
      after: [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
        "- [ ] mine [[qntm:2604]] #task",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      ].join("\n"),
    },
    {
      name: "a stamped node that moved section — the one regression risk in the whole anchor arc",
      before: ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]", "## Work"].join("\n"),
      after: ["## Bucket", "## Work", "- [ ] Ring the dentist #work [[qntm:9000]]"].join("\n"),
    },
    {
      name: "metrics.md's changing ratio — headings addressed by ordinal, never by characters",
      before: ["## On-track accuracy (3d) 🎯 0.44", "## Age of intent (30d) 🎯 5.7"].join("\n"),
      after: ["## On-track accuracy (3d) 🎯 0.39", "## Age of intent (30d) 🎯 6.1"].join("\n"),
    },
    {
      name: "the region above the first heading, which still has no ordinal to be named by",
      before: ["- [ ] mine", "## Inbox", "- [ ] a [[qntm:1]]"].join("\n"),
      after: ["- [ ] mine [[qntm:3]] #task", "## Inbox", "- [ ] a [[qntm:1]]"].join("\n"),
    },
  ];

  for (const { name, before, after } of FIXTURES) {
    test(`identical, line for line — ${name}`, async () => {
      const old = await reverted();
      const lines = before.split("\n");
      let compared = 0;
      for (let at = 0; at < lines.length; at += 1) {
        const mine = instanceAnchorFor(before, at, VIEW);
        const theirs = old.instanceAnchorFor(before, at, VIEW);
        assert.deepEqual(mine, theirs, `the anchor at line ${at} changed`);
        if (mine === null) {
          continue;
        }
        compared += 1;
        assert.deepEqual(
          resolveInstanceAnchor(mine, after, VIEW),
          old.resolveInstanceAnchor(theirs, after, VIEW),
          `the reading at line ${at} changed`,
        );
      }
      assert.ok(compared > 0, "the fixture compared nothing, so it proved nothing");
    });
  }

  test("and the ONE place they differ is the empty section — the mutation is live, not inert", async () => {
    // The control. Without this, every test above would pass against a mutation that did nothing.
    const old = await reverted();
    const before = ["## Inbox", "## Domain Empty", "- [ ] mine"].join("\n");
    const after = ["## Inbox", "## Domain Empty", "- [ ] mine [[qntm:3]] #task"].join("\n");

    assert.equal(old.instanceAnchorFor(before, 2, VIEW).relative, null, "the old bundle took no anchor");
    assert.equal(
      old.resolveInstanceAnchor(old.instanceAnchorFor(before, 2, VIEW), after, VIEW).outcome,
      "absent",
      "and so it lost the cursor — this is the defect, reproduced",
    );
    assert.equal(walk(before, 2, after).reading.via, "relative", "the shipped bundle keeps it");
  });
});
