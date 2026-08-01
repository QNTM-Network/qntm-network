/**
 * THE PROJECTION-REPLAY CONVERGENCE TEST — design-the-resolution-architecture.md STEP 12,
 * L7 RECONCILIATION.
 *
 *   node --test tests/present-replay.test.mjs
 *
 * ── TEST HARNESS, NOT A RUNTIME CHECK — ARGUED, NOT ASSUMED ──
 *
 * The design document's own step table calls this "the projection-replay convergence TEST"
 * (§7, step 12) and §6.3 separately forbids the one thing a RUNTIME version of this would be
 * tempted to do: "Do not build a 'reconciliation' that resolves a disagreement automatically…
 * the server wins and the difference is SAID." A runtime checker that compared a live prediction
 * to the arriving projection and then acted on the answer — silently re-showing a corrected note,
 * or (worse) editing the row — would be exactly that machinery, dressed as a safety net. Two
 * independent reasons keep this a test:
 *
 *   1. THE COMPARISON NEEDS THE *PREDICTION*, WHICH THE APP DOES NOT KEEP. `membershipNoteFor` and
 *      `orderingNoteFor` (app/index.html) compute a sentence and hand it straight to `sayAsOf`,
 *      which the very next freshness-line write overwrites — `writeFile`'s own header calls this
 *      "the honest middle: neither manufacturing a confirmation this app cannot make, nor leaving
 *      an unconfirmed guess on screen indefinitely." A runtime checker would have to hold the
 *      prediction PAST that lapse specifically so a later projection could be compared against it —
 *      reintroducing the exact "stale prediction" state that comment refuses. This harness can hold
 *      it because it is not live: `replay()` receives the prediction's own inputs and the arriving
 *      projection in the SAME call, never across a real elapsed cycle.
 *   2. THE MARQUEE FINDING BELOW (§1) IS THAT THE COMPARISON MOSTLY CANNOT BE MADE AT ALL, YET,
 *      FOR THE ONE PREDICTION THAT MATTERS MOST. A runtime check wired to a comparison that returns
 *      "unconfirmable" on the operator's own worked example would either say nothing (no better
 *      than today) or invent a confirmation it does not have (worse than today, and the exact
 *      failure `writeFile`'s own header already refused once). Building the checker now would be
 *      building a machine with nothing honest to say most of the time it ran.
 *
 * IS A RUNTIME CHECK EVER CHEAP AND SAFE? Partially, and it is worth saying which part rather than
 * refusing wholesale. §5 below (BASE STALENESS) is ALREADY a live runtime check — `BaseSurface`
 * ships and `writeFile` calls it on every save. What this harness adds for base staleness is not
 * new production logic, only a fixture exercising the surface that already exists. The genuinely
 * NEW comparisons here — cursor-convergence-implies-membership, and the ordering rank check — are
 * the ones with nowhere honest to land yet, per point 2. If a future step widens the instance
 * format so an unstamped line's identity SURVIVES its own first stamp (the real fix the marquee
 * finding below points at, not built here), the runtime half of THIS SPECIFIC check would become
 * cheap and worth revisiting — filed as `widen-instance-identity-past-the-first-stamp` (backlog.yaml),
 * not built here, because building it now would be building it against the wrong instance format.
 *
 * ── WHERE THE PROJECTIONS COME FROM ──
 *
 * EVERY BEFORE STRING BELOW IS A LITERAL COPY of real content read read-only from `~/qntm` on
 * 2026-08-01 (the file and line range are cited beside each one). EVERY AFTER STRING is
 * hand-constructed by this test — a second string, never the output of a cycle, a `graph-sync`, or
 * a POST — following the FIVE transformation kinds the step's own brief names: a line stamped by
 * the cycle (§1), a line inserted above (§2b), a line moved between sections (§2c, and see that
 * section's own note on why it could not be drawn from real content), a line deleted (§2d), and a
 * value in a heading changing (§2e). No cycle ran to produce any of them. Both strings are embedded
 * directly rather than read from `~/qntm` at test time — the deliberate choice explained in the PR:
 * a fixture that only runs when a personal vault happens to be checked out at a fixed path would be
 * untestable in CI and unreadable by a reviewer without that vault: an embedded literal is the same
 * evidence, checkable by anyone who opens this file.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { applyEdit, readQualificationDeclaration, readConfigResolutionDeclaration } from "../dist/present.js";
import { replay } from "./fixtures/replay-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVED = JSON.parse(readFileSync(resolve(HERE, "..", "presentation.json"), "utf8"));
const QUALIFICATION = readQualificationDeclaration(SERVED).qualification;
const RESOLUTION = readConfigResolutionDeclaration(SERVED).resolution;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REAL CONTENT — literal copies, read read-only from ~/qntm on 2026-08-01. Never re-read at test
// time; see this file's header for why.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** `~/qntm/inbox.md`, in full, as it stood 2026-08-01. */
const REAL_INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
].join("\n");

/** `~/qntm/dev/flow-trace/queue.md`, first three items (of 15 in-progress/open), as it stood
 * 2026-08-01 — trimmed to keep the fixture legible; the trim changes nothing this suite reads. */
const REAL_QUEUE = [
  "## Queue",
  "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 1",
  "- [/] matches-scope-is-separator-agnostic [[qntm:2304]] #chore #dev 🔢 2",
  "- [ ] weak-tier-enforcer-gates-capability-working-rollup [[qntm:1666]] #chore #dev 🔢 3",
].join("\n");

/** `~/qntm/metrics.md`, in full, as it stood 2026-08-01 — five headings, zero body lines, the
 * exact view the design document's own §"the ordinal, counted the same way" measurement cites for
 * a ratio that changes every cycle while the section order does not. */
const REAL_METRICS = [
  "## On-track accuracy (today) 🎯 0.21",
  "## On-track accuracy (3d) 🎯 0.44",
  "## On-track accuracy (7d) 🎯 0.51",
  "## Age of intent (30d) 🎯 5.7",
  "## Scheduled coverage (%) 🎯 11.0",
].join("\n");

const INBOX_VIEW = { id: "inbox", path: "inbox.md" };
const QUEUE_VIEW = { id: "flowtrace-queue", path: "dev/flow-trace/queue.md" };
const METRICS_VIEW = { id: "metrics", path: "metrics.md" };

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE MARQUEE FINDING — a real membership prediction, on the operator's own worked example,
//    cannot be confirmed once a real cycle stamps the line it was made about.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE MARQUEE FINDING — membership prediction vs. the first stamp", () => {
  test(
    "his own worked example (membership.ts's header) — 'add #work and it leaves Domain Empty' — " +
      "is predicted, and the harness cannot confirm it once the cycle mints the line",
    () => {
      // BEFORE: the same two headings real inbox.md carries, plus one bare capture — the exact
      // shape membership.ts's own header narrates ("a bare line typed under 'Domain Empty'").
      // Real inbox.md did not carry a bare line the day this was read, so this one line is
      // constructed, matching the document's own worked example rather than inventing a new one.
      const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
      const gesture = { kind: "set-line", lineIndex: 2, text: "- [ ] Ring the dentist #work" };
      // AFTER: the cycle mints the line (domain-empty's registered nodeType, "task") and stamps
      // it — the ONE thing every real stamped line in ~/qntm/inbox.md shows happening
      // unconditionally (all three of REAL_INBOX's real lines carry `[[qntm:N]]`). Once `domain`
      // is `work`, the line qualifies for neither of inbox's two published sections (`domain-empty`
      // needs domain null; `inbox-items` needs node_type `inbox`, and the minted type is `task`) —
      // so it leaves the view exactly as the prediction says, but nowhere THIS view can show it
      // arriving.
      const after = ["## Inbox", "## Domain Empty"].join("\n");

      const result = replay({
        view: INBOX_VIEW,
        before,
        gesture,
        after,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
      });

      // THE PREDICTION IS REAL — this is not an abstention. `membershipNoteFor` would show "this
      // line will leave Domain Empty" for exactly this edit.
      assert.equal(result.membership.predicted.kind, "leaves");

      // THE CURSOR CANNOT FIND IT. Root cause, read directly off the anchor: the freshly-typed
      // line has NO node (`anchor.node === null`) because membershipFor only ever answers for a
      // line with no `[[qntm:N]]` of its own (instance.ts's own header, "WHAT DOES NOT COLLAPSE") —
      // so the two-tier walk's second tier, the one that would follow a moved NODE across
      // sections, has nothing to search with. The FIRST tier fails too, because the line's own
      // TEXT is its whole identity for an unstamped line and the operator's own edit already
      // changed it. Both tiers are structurally unavailable at once, which is why this is
      // `absent`, not `ambiguous`.
      assert.equal(result.cursor.outcome, "absent");
      assert.equal(result.anchor.node, null, "the anchor has no node — this is WHY tier 2 cannot run");

      // THE COMPARISON CANNOT BE MADE — not "wrong", `null`: there is nothing to compare the
      // prediction against, because the row that would carry the answer cannot be found at all.
      assert.equal(result.membership.actual.kind, "unknown");
      assert.equal(result.membership.converged, null);

      // AND WHAT THE APP DOES WITH THE CHARACTERS, ADDED WITH `a-refused-edit-is-held-unanchored`.
      // Every reading above goes `unknown` for this arrival, which is exactly the situation the
      // holding surface exists for: the harness ran out of things to say about the ROW, and this is
      // what it can still say about the WRITING. The characters held are the ones the operator
      // TYPED — `gesture.text` — not the line as it stood before he typed into it.
      assert.notEqual(result.held, null, "the marquee case dropped his typing");
      assert.equal(result.held.text, "- [ ] Ring the dentist #work");
      assert.equal(result.held.reason, "vanished");
      assert.equal(result.held.node, null, "the held row carries the SAME null node the anchor had");
      assert.equal(result.held.instance, result.anchor.instance);
    },
  );

  test(
    "the same mechanism, for a BRAND NEW capture (openLine's own case, not an existing line's " +
      "edit) — THIS ASSERTION WAS CHANGED BY `widen-instance-identity-past-the-first-stamp`, and " +
      "the change is the point: it used to assert `absent` and now asserts a confirmed restore",
    () => {
      // ── WHY THIS TEST'S EXPECTED VALUES CHANGED, SAID PLAINLY ──
      //
      // As merged, this test asserted `cursor.outcome === "absent"` and `preserved === "unknown"`.
      // Those were not assertions about what SHOULD happen; they were the measurement of the
      // blocker, recorded so it could not be forgotten. `app/present/relative.ts` closes exactly
      // this case, so the measurement changes — and a test whose expected values were the DEFECT
      // is the one kind of test that must change when the defect is fixed. Nothing about the
      // fixture moved: the same before, the same gesture, the same after. Only the answer.
      //
      // The sibling test above it — the one where the line LEAVES THE VIEW ENTIRELY — is
      // UNCHANGED and still asserts `absent`, which is what stops this change from being a test
      // rewritten to fit an implementation.
      const before = REAL_INBOX;
      // A brand-new bare line, inserted where the operator opened one under "## Domain Empty"
      // (index 2, right after the heading, ahead of the three existing stamped items).
      const gesture = { kind: "insert-line", lineIndex: 2, text: "- [ ] Ring the dentist" };
      // AFTER: the cycle mints qntm:2604 (the real file's highest id is 2603; this is the next
      // plausible one, a fixture's own choice, never observed) and stamps it with the same
      // `#task 🆕 <date>` shape every real line in this file already carries, dated today.
      const after = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
        "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n");

      const result = replay({
        view: INBOX_VIEW,
        before,
        gesture,
        after,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
      });

      // No membership NOTE fires for an insert (membershipNoteFor's own `commit.kind !== "set-line"`
      // guard) — predicted is correctly "abstain" here, distinguishing this case from the one above:
      // this test is about the CURSOR alone, not a membership prediction.
      assert.equal(result.membership.predicted.kind, "abstain");

      // THE ROOT CAUSE IS UNCHANGED — the anchor still has no node, and the first two tiers of the
      // walk still cannot answer. What changed is that there is now a THIRD thing to ask.
      assert.equal(result.anchor.node, null, "the line still has no node — nothing about that is fixed");
      assert.notEqual(result.anchor.relative, null, "but it does now carry where it SAT");
      assert.equal(result.anchor.relative.below, "qntm:2603", "bracketed from below by the item it was typed above");

      assert.equal(result.cursor.outcome, "found");
      assert.equal(result.cursor.via, "relative", "the bracket held and the characters confirmed it");
      assert.equal(result.cursor.lineIndex, 2);
      assert.equal(result.preserved, true, "and now the harness CAN check what survived — it did");
      assert.equal(result.held, null, "a row that was found is a row the file owns; holding it would double it");
    },
  );

  test(
    "WHAT THIS GENERALISES TO, STATED RATHER THAN LEFT IMPLICIT: `membershipFor` answers only when " +
      "`qntmIdSpans(line).length === 0` (membership.ts) — so ANY real 'leaves'/'stays' prediction is, " +
      "by construction, about a line with no node yet, and `instanceAnchorFor` gives that line's " +
      "anchor `node: null` (instance.ts) the instant it is typed. Both facts hold for every " +
      "membership prediction this app can ever make, not only the two fixtures above.",
    () => {
      // A direct restatement of the precondition, so a reader does not have to trust the prose:
      // membershipFor's OWN first check is exactly the guard this finding turns on.
      const line = "- [ ] Ring the dentist #work";
      assert.doesNotMatch(line, /\[\[qntm:\d+\]\]/, "a line membershipFor will answer for carries no stamp");
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1b. THE MEASURED BLOCKER ITSELF, CLOSED — `- [ ] Lesley pay tenner`, the exact line
//     `design-presentation-instance-identity.md` §3.2 anchored on as the operator typed it and
//     resolved against the projection that came back:
//
//       inbox line 2, stamp=null, section="## Domain Empty"  ->  {"outcome":"absent"}
//
//     This is the one fixture in this file whose AFTER is not constructed at all: the after IS
//     `REAL_INBOX`, the literal copy of `~/qntm/inbox.md` read read-only on 2026-08-01. The
//     BEFORE is that same file with the one line he typed removed — which is what it said the
//     moment before he typed it.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1b. THE MEASURED BLOCKER — his own line, reproduced first, then closed", () => {
  /** `~/qntm/inbox.md` the moment before `- [ ] Lesley pay tenner` was typed into it. */
  const BEFORE_HE_TYPED = [
    "## Inbox",
    "## Domain Empty",
    "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
    "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
  ].join("\n");
  const GESTURE = { kind: "insert-line", lineIndex: 2, text: "- [ ] Lesley pay tenner" };

  test("REPRODUCED — the two tiers that existed before this row still cannot answer", () => {
    const result = replay({
      view: INBOX_VIEW,
      before: BEFORE_HE_TYPED,
      gesture: GESTURE,
      after: REAL_INBOX,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    // TIER 1, INSTANCE. An unstamped line's identity IS its own characters, and the cycle appended
    // to them — so the instance the anchor was taken with is not in the projection.
    assert.equal(result.anchor.instance, "inbox/1/- [ ] Lesley pay tenner");
    const arrived = REAL_INBOX.split("\n")[2];
    assert.notEqual(arrived, "- [ ] Lesley pay tenner", "the stamp changed the characters — tier 1 cannot match");

    // TIER 2, NODE. There is nothing to search with, and that follows from `membershipFor`'s own
    // precondition rather than from this fixture: it answers only for a line carrying no stamp.
    assert.equal(result.anchor.node, null);
  });

  test("CLOSED — the cursor holds, by the bracket, and his characters survive", () => {
    const result = replay({
      view: INBOX_VIEW,
      before: BEFORE_HE_TYPED,
      gesture: GESTURE,
      after: REAL_INBOX,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.cursor.outcome, "found", "the measured `absent` is gone");
    assert.equal(result.cursor.via, "relative");
    assert.equal(result.cursor.lineIndex, 2, "the same row, in the file the vault really holds");
    assert.equal(result.preserved, true, "and the cycle appended to what he typed rather than replacing it");
    assert.equal(result.held, null, "nothing needs holding — the file owns the characters");
  });

  test(
    "AND THE COMPARISON THAT COULD NOT BE MADE CAN NOW BE MADE — `membership.actual` was `unknown` " +
      "for every arrival of this shape, because the ROW could not be found. It can be found now.",
    () => {
      // The same gesture as a `set-line`, which is the shape `membershipNoteFor` actually predicts
      // for. His line stays in Domain Empty (no `#work`), the cycle stamps it, and the harness's
      // ground truth — the cursor's own reading — now says `stays` instead of `unknown`.
      const before = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Lesley pay tennr",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n");
      const result = replay({
        view: INBOX_VIEW,
        before,
        gesture: { kind: "set-line", lineIndex: 2, text: "- [ ] Lesley pay tenner" },
        after: REAL_INBOX,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
      });

      assert.equal(result.membership.predicted.kind, "stays", "a real prediction, not an abstention");
      assert.equal(result.membership.actual.kind, "stays", "was `unknown` before this row — the row was unfindable");
      assert.equal(result.membership.converged, true, "was `null` before this row — nothing to compare against");
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. CURSOR CONVERGENCE — the four other transformation kinds the step's own brief names.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. CURSOR CONVERGENCE across the cycle's real transformations", () => {
  test("2b. a line inserted ABOVE the cursor — the row is still found, by instance", () => {
    // BEFORE: the real queue's first two in-progress items. Cursor sits on the second.
    const before = REAL_QUEUE;
    const gesture = { kind: "none", lineIndex: 2 }; // "matches-scope-is-separator-agnostic"
    // AFTER: the cycle inserts a new item ABOVE it (a real, common queue event — a higher-priority
    // chore lands) and everything from there down shifts by one line.
    const after = [
      "## Queue",
      "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 1",
      "- [ ] new-thing-the-cycle-added [[qntm:9999]] #chore #dev 🔢 2",
      "- [/] matches-scope-is-separator-agnostic [[qntm:2304]] #chore #dev 🔢 3",
      "- [ ] weak-tier-enforcer-gates-capability-working-rollup [[qntm:1666]] #chore #dev 🔢 4",
    ].join("\n");

    const result = replay({
      view: QUEUE_VIEW,
      before,
      gesture,
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.cursor.outcome, "found");
    assert.equal(result.cursor.via, "instance", "same node, same section — the STAMP tier never had to run");
    assert.equal(result.cursor.lineIndex, 3, "the row moved from index 2 to index 3, and the anchor followed it");
    // THE CONTROL FOR THE HOLDING READING. A row that was found is a row the file still owns, so
    // holding a copy of it would put a second claim to the same characters on screen.
    assert.equal(result.held, null, "an ordinary arrival held a row it had no reason to");
  });

  test(
    "2c. a line MOVED BETWEEN SECTIONS — found via the NODE tier, not the instance tier. " +
      "CONSTRUCTED, not drawn from ~/qntm: no predicate in the operator's real config moves a " +
      "line between two sections of ONE view (inbox's own domain-empty leaves the VIEW entirely, " +
      "never a sibling section of it — see §1's fixture) — a minimal two-section declaration " +
      "stands in, built from the same real vocabulary (#work) the operator's own config uses.",
    () => {
      const view = { id: "demo-move", path: "demo-move.md" };
      const qualification = {
        defaultNodeType: "task",
        structuralNodeTypes: [],
        tokens: { node_type: {}, domain: { "#work": "work" }, status: { "[ ]": "open", "[x]": "done" } },
        predicates: {
          bucket: { find: { nodeType: null, fields: { domain: { eq: null } } }, exclude: [] },
          work: { find: { nodeType: null, fields: { domain: { eq: "work" } } }, exclude: [] },
        },
        sections: {
          "demo-move": {
            bucket: { qualification: "bucket", nodeType: "task", name: "Bucket" },
            work: { qualification: "work", nodeType: "task", name: "Work" },
          },
        },
        sectionOrder: { "demo-move": ["bucket", "work"] },
        refused: {},
      };
      const resolution = { ordering: {}, orderingFields: {} };

      const before = ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]", "## Work"].join("\n");
      // No local edit — a RULE elsewhere in the graph retags the node (a due date passing, a
      // related task completing) and the next cycle moves it, independent of anything typed here.
      const gesture = { kind: "none", lineIndex: 1 };
      const after = ["## Bucket", "## Work", "- [ ] Ring the dentist #work [[qntm:9000]]"].join("\n");

      const result = replay({ view, before, gesture, after, qualification, resolution });

      assert.equal(result.cursor.outcome, "found");
      assert.equal(result.cursor.via, "node", "the instance changed section, so only the node tier could find it");
      assert.equal(result.cursor.lineIndex, 2);
      // Nothing was predicted (no local edit), so nothing to converge — this scenario is about
      // the CURSOR alone.
      assert.equal(result.membership.predicted.kind, "abstain");
      assert.equal(result.membership.converged, null);
      assert.equal(result.held, null, "a row found by the NODE tier is still a row the file owns");
    },
  );

  test(
    "2d. a line DELETED entirely — absent, for a DIFFERENT reason than §1's absent: the anchor " +
      "HAS a node here, so the node tier really ran and really found nothing, rather than never " +
      "having anything to search with",
    () => {
      const before = REAL_INBOX;
      const gesture = { kind: "none", lineIndex: 4 }; // "Remove zoe from all coverage", qntm:2598
      // AFTER: qntm:2598 was finished elsewhere and no longer qualifies domain-empty (its own
      // status excludes `done`) — it is gone from the printed section, not moved.
      const after = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      ].join("\n");

      const result = replay({
        view: INBOX_VIEW,
        before,
        gesture,
        after,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
      });

      assert.equal(result.cursor.outcome, "absent");
      assert.equal(result.anchor.node, "qntm:2598", "the anchor DID have a node — the node tier ran and found nothing");
      assert.equal(result.membership.actual.kind, "unknown");

      // HELD, AND IT IS THE OTHER `absent` CAUSE — the one distinction this fixture exists to draw.
      // §1's held row carries `node: null` because the node tier never ran; this one carries a real
      // id because it ran and found nothing. The app holds in BOTH cases and does not need to tell
      // them apart to do the safe thing — which is why `snapshot.graph` staying unread
      // (`resolve-from-the-model-not-the-text`) does not block this row.
      assert.notEqual(result.held, null, "a line the cycle deleted took the operator's row with it");
      assert.equal(result.held.text, "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31");
      assert.equal(result.held.node, "qntm:2598");
      assert.equal(result.held.path, "inbox.md", "a held row must name the file it came from");
    },
  );

  test(
    "2e. a value in a HEADING changing — the row survives, because a heading's identity token is " +
      "a constant (instance.ts), never the ratio printed beside it",
    () => {
      const before = REAL_METRICS;
      const gesture = { kind: "none", lineIndex: 1 }; // "## On-track accuracy (3d) 🎯 0.44"
      // AFTER: every ratio recomputed by the next cycle — the exact shape the design document's
      // own §"the section is an ordinal" measurement cites (0.49 -> 0.44 between two real reads).
      const after = [
        "## On-track accuracy (today) 🎯 0.24",
        "## On-track accuracy (3d) 🎯 0.39",
        "## On-track accuracy (7d) 🎯 0.51",
        "## Age of intent (30d) 🎯 5.6",
        "## Scheduled coverage (%) 🎯 11.0",
      ].join("\n");

      const result = replay({
        view: METRICS_VIEW,
        before,
        gesture,
        after,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
      });

      assert.equal(result.cursor.outcome, "found");
      assert.equal(result.cursor.via, "instance", "the heading's token is a constant, so its changing ratio never mattered");
      assert.equal(result.cursor.lineIndex, 1, "the SAME ordinal — nothing shifted, only the text beside it changed");
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ORDERING CONVERGENCE — a genuine confirmed prediction, over real content. Unlike membership
//    (§1), `orderingFor` does not abstain for a STAMPED line — it reads a marker token off ANY
//    line's text, so an edit to an EXISTING node's ordering field sidesteps the first-stamp problem
//    entirely and can be confirmed once the projection arrives.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. ORDERING CONVERGENCE — predicted rank matches the arrived rank, over real content", () => {
  test("qntm:2303 reprioritised from position 1 to 5 — predicted afterRank equals the arrived rank", () => {
    const before = REAL_QUEUE;
    const gesture = {
      kind: "set-line",
      lineIndex: 1,
      text: "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 5",
    };
    // AFTER: the cycle re-renders the section in `queue_position` order, the real behaviour every
    // one of the three real `queue` sections shows (REAL_QUEUE itself is already in that order).
    const after = [
      "## Queue",
      "- [/] matches-scope-is-separator-agnostic [[qntm:2304]] #chore #dev 🔢 2",
      "- [ ] weak-tier-enforcer-gates-capability-working-rollup [[qntm:1666]] #chore #dev 🔢 3",
      "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 5",
    ].join("\n");

    const result = replay({
      view: QUEUE_VIEW,
      before,
      gesture,
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.cursor.outcome, "found");
    assert.equal(result.cursor.via, "instance", "the node id is stable, so instance alone finds it");
    assert.equal(result.ordering.predicted.kind, "rank");
    assert.equal(result.ordering.predicted.rank, 3, "last among the 3 siblings BEFORE the cycle re-renders");
    assert.equal(result.ordering.actual.kind, "rank");
    assert.equal(result.ordering.actual.rank, 3, "last among the (possibly different) siblings the arrived text shows");
    assert.equal(result.ordering.converged, true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. PRESERVED — nothing typed is silently replaced, checked over the one case where it CAN be
//    checked (the cursor found the row).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. PRESERVED — the operator's own characters, checked against the arrived row", () => {
  test("a checkbox tick survives an otherwise-unrelated cycle", () => {
    const before = ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]"].join("\n");
    const gesture = { kind: "set-line", lineIndex: 1, text: "- [x] Ring the dentist [[qntm:9000]]" };
    const after = ["## Bucket", "- [x] Ring the dentist [[qntm:9000]]"].join("\n");

    const result = replay({
      view: { id: "demo-preserve", path: "demo-preserve.md" },
      before,
      gesture,
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.cursor.outcome, "found");
    assert.equal(result.preserved, true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. BASE STALENESS — fires and stays silent, `BaseSurface` wired into one fixture call. This is
//    the one comparison in this file that IS already a live runtime check (`app/index.html`'s
//    `writeFile` calls `served.read` on every save) — the harness adds no new production logic
//    here, only a fixture exercising the surface that already ships.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. BASE STALENESS — fires and stays silent, as it already does in production", () => {
  const before = REAL_INBOX;
  const gesture = { kind: "none", lineIndex: 0 };
  const after = REAL_INBOX; // irrelevant to this section — base staleness is about the WRITE, not the arrival

  test("current — the write's base IS what the server last sent", () => {
    const result = replay({
      view: INBOX_VIEW,
      before,
      gesture,
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });
    assert.equal(result.base.outcome, "current");
  });

  test("stale — the write's base is an EARLIER copy than what the server last sent", () => {
    const olderCopy = ["## Inbox", "## Domain Empty"].join("\n"); // before the three items were captured
    const result = replay({
      view: INBOX_VIEW,
      before,
      editBase: olderCopy,
      gesture,
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });
    assert.equal(result.base.outcome, "stale");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE MUTATION PROOF — a harness that cannot go red is decoration. Two known-good scenarios
//    from above, deliberately corrupted the way a real defect would corrupt them, proving the
//    checks that just passed above are not vacuous.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. THE MUTATION PROOF — deliberately broken fixtures, caught", () => {
  test("MUTATED §4 — the cycle silently REVERTS the operator's own tick: preserved flips to false", () => {
    const before = ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]"].join("\n");
    const gesture = { kind: "set-line", lineIndex: 1, text: "- [x] Ring the dentist [[qntm:9000]]" };
    // MUTATION: the arrived projection shows the box UNTICKED — a stale write racing this one, or
    // a bug in whatever produced the projection, silently discarding what was typed.
    const mutatedAfter = ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]"].join("\n");

    const result = replay({
      view: { id: "demo-preserve", path: "demo-preserve.md" },
      before,
      gesture,
      after: mutatedAfter,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.cursor.outcome, "found", "the row is still there — only its content was clobbered");
    assert.equal(result.preserved, false, "the mutation must be caught, not silently pass");
  });

  test("MUTATED §2b — the cycle drops the node's stamp entirely: cursor flips from found to absent", () => {
    const before = REAL_QUEUE;
    const gesture = { kind: "none", lineIndex: 2 };
    // MUTATION: qntm:2304's own stamp is gone from the arrived text — a defect in whatever
    // produced this projection (this harness does not claim a real cycle could do this; the point
    // is that IF something upstream ever did, the check must not report convergence anyway).
    const mutatedAfter = [
      "## Queue",
      "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 1",
      "- [/] matches-scope-is-separator-agnostic #chore #dev 🔢 2",
      "- [ ] weak-tier-enforcer-gates-capability-working-rollup [[qntm:1666]] #chore #dev 🔢 3",
    ].join("\n");

    const result = replay({
      view: QUEUE_VIEW,
      before,
      gesture,
      after: mutatedAfter,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.cursor.outcome, "absent", "no instance match (no stamp to compare) and no node to search with");
  });

  test("MUTATED §3 — the cycle's OWN cascade overrides the reprioritisation: converged flips to false", () => {
    const before = REAL_QUEUE;
    const gesture = {
      kind: "set-line",
      lineIndex: 1,
      text: "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 5",
    };
    // MUTATION: the operator asked for queue_position 5 (predicted afterRank: last, 3rd of 3); the
    // arrived projection instead shows qntm:2303 back at queue_position 1 — as if a rule elsewhere
    // in the graph reasserted a priority the moment the cycle ran, overriding what was typed.
    // `orderingFor`'s rank is a VALUE comparison, not a positional one (it does not care where in
    // the file a line prints), so the mutation has to change the marker's VALUE to be caught —
    // reordering the same three values would not move any rank number at all, which is itself
    // worth knowing about this check's own shape.
    const mutatedAfter = [
      "## Queue",
      "- [/] matches-scope-is-separator-agnostic [[qntm:2304]] #chore #dev 🔢 2",
      "- [ ] weak-tier-enforcer-gates-capability-working-rollup [[qntm:1666]] #chore #dev 🔢 3",
      "- [/] typescript-capture-backend [[qntm:2303]] #chore #dev 🔢 1",
    ].join("\n");

    const result = replay({
      view: QUEUE_VIEW,
      before,
      gesture,
      after: mutatedAfter,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });

    assert.equal(result.ordering.predicted.rank, 3, "the operator's own edit predicted LAST among the siblings");
    assert.equal(result.ordering.actual.rank, 1, "the arrived projection instead shows it FIRST");
    assert.equal(result.ordering.converged, false, "the mutation must be caught, not silently pass");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE DESIGN DOCUMENT'S OWN FALSIFIER, LITERALLY — "take a real before/after markdown pair …
//    apply the browser's predicted change to the before … assert it equals the after." Run once
//    where it holds (nothing else in the file changes) and once where it does NOT (§1's own
//    fixture — the exact case this falsifier exists to catch), proving it discriminates rather
//    than passing vacuously either way.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. THE DESIGN DOCUMENT'S OWN FALSIFIER — localAfter vs. the arrived after, literally", () => {
  test("HOLDS — a checkbox tick, with nothing else in the file touched by the cycle", () => {
    const before = ["## Bucket", "- [ ] Ring the dentist [[qntm:9000]]"].join("\n");
    const localAfter = applyEdit(before, {
      kind: "set-line",
      lineIndex: 1,
      text: "- [x] Ring the dentist [[qntm:9000]]",
    });
    const after = ["## Bucket", "- [x] Ring the dentist [[qntm:9000]]"].join("\n");
    assert.equal(localAfter, after, "the browser's own predicted change equals what arrived");
  });

  test(
    "DOES NOT HOLD — §1's own fixture: the browser's predicted change (a bare line unchanged " +
      "except for #work) is not what arrives (the cycle also mints a stamp), and the falsifier " +
      "catches exactly that disagreement rather than being satisfied by it",
    () => {
      const before = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
      const localAfter = applyEdit(before, {
        kind: "set-line",
        lineIndex: 2,
        text: "- [ ] Ring the dentist #work",
      });
      const after = ["## Inbox", "## Domain Empty"].join("\n"); // the cycle's real output — the line minted, then left the view
      assert.notEqual(localAfter, after, "the falsifier fires — a prediction and a cycle disagree, exactly as designed");
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE DRAFT — a line he has OPEN and has not committed, put back where it was.
//
//    THE ROW THE OTHER SEVEN SECTIONS CANNOT DESCRIBE. Every reading above is about a line that is
//    in a source string at one end or the other. A draft is in NEITHER: not in `before` (nothing
//    is written until it settles — app/present/draft.ts) and not in `after` (the cycle never saw
//    it). `relativeAnchorFor` returns `null` for it and cannot do otherwise, which is why the row
//    is anchored on its NEIGHBOUR and inherits `ANCHOR_TRUST` through it.
//
//    THE GESTURE THESE FIXTURES ARE, IN ONE SENTENCE: he captures a thing, presses Enter, presses
//    `o` and starts the next one — and roughly fourteen seconds later the first capture's own
//    cycle comes back. That is one gesture in the operator's own inbox, not a corner case.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("8. THE DRAFT — a line being made survives a projection arriving", () => {
  /** `~/qntm/inbox.md` the moment before `- [ ] Lesley pay tenner` was typed into it. */
  const BEFORE_HE_TYPED = [
    "## Inbox",
    "## Domain Empty",
    "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
    "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
  ].join("\n");

  const SEED = "- [ ] ";
  const drafting = (lineIndex, typed = SEED) => ({ lineIndex, seed: SEED, typed });

  test("THE PLACE IS TAKEN AT ALL, and it is the neighbour ABOVE — the row is opened beneath one", () => {
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after: REAL_INBOX,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(3),
    });
    assert.equal(result.draft.draft.place.side, "above");
    assert.equal(result.draft.draft.place.anchor.node, "qntm:2603", "the line `o` was pressed on");
  });

  test("SURVIVES a line the cycle inserted ABOVE it — the index moved and the row moved with it", () => {
    // The cycle files something new at the top of Domain Empty. Everything below shifts down one.
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] New capture from the phone [[qntm:2610]] #task 🆕 2026-08-01",
      "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
    ].join("\n");
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(3, "- [ ] Call the bank"),
    });
    assert.equal(result.draft.placement.outcome, "placed");
    assert.equal(result.draft.placement.lineIndex, 4, "was 3; the insert above moved it to 4");
    // `instance`, NOT `node`, AND THE REASON IS WORTH RECORDING: an instance string is
    // `${view}/${section}/${token}` (instance.ts) and carries no position, so a line the cycle
    // inserted ABOVE the neighbour changes neither the neighbour's section nor its token. The
    // strongest rung answers, which is exactly what ANCHOR_TRUST is ordered for.
    assert.equal(result.draft.placement.via, "instance");
  });

  test("SURVIVES a line the cycle appended BELOW it — nothing above moved, so neither did the row", () => {
    const after = [
      REAL_INBOX,
      "- [ ] Something the cycle filed underneath [[qntm:2611]] #task 🆕 2026-08-01",
    ].join("\n");
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(3, "- [ ] Call the bank"),
    });
    assert.equal(result.draft.placement.outcome, "placed");
    assert.equal(result.draft.placement.lineIndex, 3, "the row is where it was");
  });

  test("SURVIVES lines changed above AND below at once", () => {
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] New capture from the phone [[qntm:2610]] #task 🆕 2026-08-01",
      "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      "- [ ] Something the cycle filed underneath [[qntm:2611]] #task 🆕 2026-08-01",
    ].join("\n");
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(3, "- [ ] Call the bank"),
    });
    assert.equal(result.draft.placement.outcome, "placed");
    assert.equal(result.draft.placement.lineIndex, 4);
  });

  test(
    "THE OPERATOR'S OWN DOUBLE CAPTURE — the neighbour was UNSTAMPED when the row was opened " +
      "beside it, and the arriving cycle stamped it. The row survives by the `relative` rung, " +
      "which is the rung a draft could never have reached for itself.",
    () => {
      // He typed `- [ ] Lesley pay tenner`, pressed Enter, pressed `o`. The painter is showing its
      // own optimistic string; the neighbour above the row carries no stamp yet.
      const before = [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Lesley pay tenner",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n");
      const result = replay({
        view: INBOX_VIEW,
        before,
        gesture: { kind: "none", lineIndex: 2 },
        after: REAL_INBOX,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
        drafting: drafting(3, "- [ ] Call the bank"),
      });
      assert.equal(result.draft.draft.place.anchor.node, null, "the neighbour had no identity of its own");
      assert.ok(result.draft.draft.place.anchor.relative !== null, "so it carried a relative anchor instead");
      assert.equal(result.draft.placement.outcome, "placed");
      assert.equal(result.draft.placement.via, "relative", "reached through the neighbour, not by the row itself");
      assert.equal(result.draft.placement.lineIndex, 3);
    },
  );

  test("RELEASED — the projection already carries his characters, so the row is not duplicated", () => {
    // He is still typing the line when the cycle ingests it. Re-placing the row here would put a
    // second copy of a line the file now owns on screen, and settling it would mint a second node.
    const result = replay({
      view: INBOX_VIEW,
      before: BEFORE_HE_TYPED,
      gesture: { kind: "none", lineIndex: 2 },
      after: REAL_INBOX,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(2, "- [ ] Lesley pay tenner"),
    });
    assert.equal(result.draft.placement.outcome, "arrived", "the cycle brought his line back, stamp appended");
  });

  test(
    "AND A LINE THE VIEW ALREADY HAD IS NOT `arrived` — the release is gated on the projection " +
      "GAINING the characters, because releasing a row is the one outcome here that destroys them",
    () => {
      const result = replay({
        view: INBOX_VIEW,
        before: REAL_INBOX,
        gesture: { kind: "none", lineIndex: 2 },
        after: REAL_INBOX,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
        // He is retyping, word for word, a line that is already in this view.
        drafting: drafting(3, "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31"),
      });
      assert.equal(result.draft.placement.outcome, "placed", "his characters are kept, not released");
    },
  );

  test("A ROW HOLDING ONLY ITS SEED IS NEVER `arrived` — it has no characters to match with", () => {
    const result = replay({
      view: INBOX_VIEW,
      before: BEFORE_HE_TYPED,
      gesture: { kind: "none", lineIndex: 2 },
      after: REAL_INBOX,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(2),
    });
    assert.notEqual(result.draft.placement.outcome, "arrived");
  });

  test("UNPLACED — the neighbour left the view, and the row refuses rather than guessing", () => {
    // The cycle moved qntm:2603 out of the inbox entirely. Nothing that outlives the cycle is left
    // beside the row, so `placeDraft` says so and the page holds the characters.
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
    ].join("\n");
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(3, "- [ ] Call the bank"),
    });
    assert.equal(result.draft.placement.outcome, "unplaced");
    assert.equal(result.draft.placement.because, "absent");
  });

  test("UNPLACED — the neighbour now prints TWICE, which is refused, never picked between", () => {
    // BOTH PRINTINGS IN ONE SECTION, and that is what makes this ambiguous rather than merely
    // duplicated. `instancesOf` separates two printings in DIFFERENT sections for free (their
    // instance strings differ by the section ordinal — instance.ts §2.4), so a cross-section
    // duplicate is still found by the strongest rung. Inside ONE section the two printings take
    // `#1`/`#2` suffixes, neither of which is the unsuffixed instance the place was taken with, so
    // the walk falls to the node tier — which finds two and refuses.
    const after = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
      "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
    ].join("\n");
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      drafting: drafting(3, "- [ ] Call the bank"),
    });
    assert.equal(result.draft.placement.outcome, "unplaced");
    assert.equal(result.draft.placement.because, "ambiguous");
  });

  test(
    "UNPLACED — `no-place`: nothing adjacent to the row has an identity at all. This is " +
      "`the-relative-anchor-has-no-landmark-in-an-empty-section` reaching the draft too, and it " +
      "refuses for the same reason: a section with nothing stamped in it offers no landmark.",
    () => {
      const empty = ["## Inbox", "", ""].join("\n");
      const result = replay({
        view: INBOX_VIEW,
        before: empty,
        gesture: { kind: "none", lineIndex: 0 },
        after: empty,
        qualification: QUALIFICATION,
        resolution: RESOLUTION,
        drafting: drafting(2, "- [ ] The first thing in an empty section"),
      });
      assert.equal(result.draft.draft.place, null, "a blank above and a blank below is no place");
      assert.equal(result.draft.placement.outcome, "unplaced");
      assert.equal(result.draft.placement.because, "no-place");
    },
  );

  test("EVERY FIXTURE WITHOUT A `drafting` READS `null` — the reading is additive, not a default", () => {
    const result = replay({
      view: INBOX_VIEW,
      before: REAL_INBOX,
      gesture: { kind: "none", lineIndex: 2 },
      after: REAL_INBOX,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
    });
    assert.equal(result.draft, null);
  });
});
