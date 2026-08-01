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

  test("NOT TAKEN when NOTHING in the section carries a stamp — the honest refusal, named", () => {
    // The operator's first capture into an empty section. There is no landmark in it that outlives
    // the cycle, so no bracket can be built. This is a REFUSAL, not a gap in the construct: a
    // bracket of two nulls is the whole file wearing a bracket's clothes.
    const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
    assert.equal(instanceAnchorFor(before, 2, VIEW).relative, null);
  });

  test("NOT TAKEN for a blank line, or out of range — matching every other anchor in this bundle", () => {
    const before = ["## Inbox", "", "- [ ] a [[qntm:1]]"].join("\n");
    assert.equal(instanceAnchorFor(before, 1, VIEW), null, "a blank line has no identity at all");
    assert.equal(instanceAnchorFor(before, 99, VIEW), null);
    assert.equal(relativeAnchorFor(instancesOf(before, VIEW), before.split("\n"), -1), null);
  });

  test("a stamped line in ANOTHER section does not bracket it — the scan stops at the section edge", () => {
    const before = ["## Inbox", "- [ ] a [[qntm:1]]", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
    assert.equal(
      instanceAnchorFor(before, 3, VIEW).relative,
      null,
      "qntm:1 is in section 0 and he is in section 1 — it is not his neighbour",
    );
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

describe("5. THE MUTATION PROOF — each guard deleted, each shown to put the cursor on the wrong line", () => {
  const BUNDLE = readFileSync(resolve(HERE, "..", "dist", "present.js"), "utf8");

  /** Load a copy of the shipped bundle with one substring replaced. */
  async function mutated(find, replaceWith) {
    assert.ok(BUNDLE.includes(find), `the mutation target "${find}" is not in dist/present.js`);
    const source = BUNDLE.replace(find, replaceWith);
    return import(`data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`);
  }

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
});
