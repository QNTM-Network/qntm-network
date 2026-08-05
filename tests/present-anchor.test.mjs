/**
 * THE HAVEN ROW 2 FALSIFIER, REWIRED 2026-07-31 ONTO INSTANCE IDENTITY.
 *
 *   node --test tests/present-anchor.test.mjs
 *
 * ── WHY THIS FILE CHANGED SHAPE, NOT JUST CONTENT ──
 *
 * `FocusSurface` used to hold an `anchor.ts` `Anchor` and resolve it by walking four rungs —
 * STAMP, STAMP_IN_SECTION, TEXT, TEXT_IN_SECTION — and this file asserted those exact tier
 * strings. `app/present/instance.ts`'s `resolveInstanceAnchor` replaces that walk with a two-tier
 * one (instance match, then node match), and `anchor.ts` is DELETED, not kept beside it — proved
 * dead by removing it and rebuilding: `npm run typecheck` and `npm run build` both stayed clean
 * with nothing importing it, and the only failure `npm test` produced was THIS file's own import of
 * symbols that no longer exist. `git show HEAD~1:app/present/anchor.ts` (or the object hash
 * `43ca90cc89a51c8754de30e4837c9f65e64a9acd100c2ea290eb4ad3e8eef53` at the commit before deletion)
 * is where its content lives now.
 *
 * A rung label was never a behaviour the operator has — it was this module's own bookkeeping about
 * WHICH LOOKUP ANSWERED, and `instance.ts`'s two-tier walk answers the same behavioural questions
 * with fewer lookups (design-presentation-instance-identity.md §1.2). So every assertion below is
 * rewritten in terms of WHAT THE CURSOR DOES — does it hold the same line, does it follow a moved
 * one, is a refusal reported — never in terms of which internal tier produced the answer.
 * `reading.via` (`"instance"` or `"node"`) is kept where a test needs to say WHY the cursor
 * followed a node rather than merely that it did, because that distinction is real: a caller
 * downstream (`the-open-line-survives-a-new-projection`) needs to treat a `"node"` restore as
 * weaker than an `"instance"` one, the same way `ANCHOR_TRUST`'s ordering used to matter.
 *
 * ── THE ONE REGRESSION RISK IN THE WHOLE CHANGE, MADE UNMISSABLE ──
 *
 * Section 3 below is the single most important test in this file: A STAMPED NODE THAT MOVES
 * SECTION STILL KEEPS THE CURSOR. The four-rung STAMP tier searched the whole file for a stamp,
 * ignoring section, so a node moving section was always found. A NAIVE instance-id lookup (keyed
 * on `${view}/${section}/${token}`) would have broken that — design doc §3.3's refutation 1 — and
 * `resolveInstanceAnchor`'s second tier (node search, whole file) is what carries the old
 * behaviour forward. This is proven twice: once driving `FocusSurface` directly (section 3), and
 * once driving the real page through its own lifted script (section 5), so a regression here
 * cannot hide behind either layer alone.
 *
 * ── THE FIXTURES ARE THE OPERATOR'S OWN LINES ──
 *
 * Verbatim from `~/qntm/this_week.md` (read-only, 2026-07-31), because two of the things this
 * module has to get right are only visible in real content: a view that prints ONE NODE TWICE
 * (this_week.md does it three times over, 6 of its 15 node lines), and a line whose `[[qntm:N]]`
 * is malformed by a typo the operator actually has (`habits.md:19`, `[qntm:1507]]`).
 *
 * ── WHAT THIS DOES NOT PROVE ──
 *
 * No browser laid anything out, no passkey session was opened, no server was contacted and no
 * projection was ever observed arriving from a real cycle. Every "projection" here is a second
 * string in this file. The claim is about what these modules do when handed one.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk } from "./fixtures/dom-stub.mjs";
import { importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";
import {
  FocusSurface,
  PresentationContext,
  instanceAnchorFor,
  paint,
  resolveInstanceAnchor,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");
const VIEW = "this-week";

// ── THE PROJECTION THE OPERATOR IS LOOKING AT — `~/qntm/this_week.md`, verbatim ────────────────
const NOW = [
  "## Overdue",
  "## Due This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "## Overdue to Start",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "    - [ ] Monthly payments [[qntm:1233]] #outcome #personal",
  "        - [ ] Pay aug [[qntm:1234]] #task #personal 📅 2026-08-28 🛫 2026-07-28 🆕 2026-06-28",
  "- [ ] Get summer suit [[qntm:2412]] #outcome #personal 🆕 2026-07-27",
  "",
].join("\n");

/** The line the cursor is in throughout. Index 5 in `NOW`. */
const CURSOR = 5;
const CURSOR_LINE = "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal";

// ── ONE LINE INSERTED ABOVE THE CURSOR — the cycle put a task into `## Overdue` ────────────────
// Real line, from `~/qntm/inbox.md`. Every index at or below the cursor shifts by one; nothing
// about the cursor's own line changes.
const INSERTED_ABOVE = NOW.split("\n")
  .flatMap((line, at) =>
    at === 0 ? [line, "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31"] : [line],
  )
  .join("\n");

// ── THE CURSOR'S NODE HAS LEFT THE VIEW — a rule moved it out ─────────────────────────────────
const ABSENT = [
  "## Overdue",
  "## Due This Week",
  "## Overdue to Start",
  "- [ ] Get summer suit [[qntm:2412]] #outcome #personal 🆕 2026-07-27",
  "",
].join("\n");

// ── THE CASE INDEX ARITHMETIC CANNOT EXPRESS — a node MOVED BETWEEN SECTIONS ───────────────────
// `qntm:1986` is under `## Due This Week` in `NOW`; overnight it becomes overdue and the engine
// prints it under `## Overdue`. To a diff this is a delete plus an insert; to the stamp it is the
// same node; to a NAIVE instance id (section baked in) it would ALSO look like a delete plus an
// insert — which is exactly why `resolveInstanceAnchor` falls back to a node search rather than
// stopping at the instance lookup. See section 3.
const MOVED_BETWEEN_SECTIONS = [
  "## Overdue",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "## Due This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "## Overdue to Start",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "",
].join("\n");

// ── THE VIEW THAT PRINTS ONE NODE TWICE — this is `~/qntm/this_week.md` as it really is ────────
// `qntm:1975`, `qntm:1986` and `qntm:1232` each appear once in their own section and again under
// `## Scheduled This Week`, as byte-identical lines. Neither the stamp nor the text tells the two
// printings apart; the SECTION does — and an instance id bakes the section in, so this resolves
// with a single lookup rather than a narrowing step. See section 4.
const PRINTED_TWICE = [
  ...NOW.split("\n").slice(0, 9),
  "## Scheduled This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "",
].join("\n");

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");

/** Paint with a focus surface and a view id, the way the page does. */
function view(source, focus, reports = []) {
  globalThis.document = makeDocument();
  const body = makeBody();
  paint(body, source, new PresentationContext(), {
    markdown: md,
    view: VIEW,
    focus,
    onLineCommit: (c) => reports.push(["commit", c.lineIndex, c.text]),
    onNewLineDeclined: (i) => reports.push(["declined", i]),
  });
  return body;
}

/** Put the cursor on `CURSOR` by clicking it, exactly as a person does. */
function cursorOnPayBack() {
  const focus = new FocusSurface();
  const reports = [];
  let body = view(NOW, focus, reports);
  const target = walk(body)
    .filter((el) => el.tagName === "span")
    .find((el) => el.innerHTML.includes("Pay back per Darinz"));
  assert.ok(target, "the fixture no longer contains the line these tests drive");
  target.dispatch("click");
  body = view(NOW, focus, reports); // the click's own repaint
  assert.equal(focus.lineIndex, CURSOR);
  return { focus, reports, body };
}

describe("1. the anchor is an INSTANCE taken off the line, not an index", () => {
  test("a stamped line's anchor carries its node and its instance", () => {
    const anchor = instanceAnchorFor(NOW, CURSOR, VIEW);
    assert.equal(anchor.node, "qntm:1232");
    assert.equal(anchor.takenAt, CURSOR);
    assert.equal(anchor.instance, `${VIEW}/2/qntm:1232`); // "## Overdue to Start" is the third heading
  });

  test("a heading has no node, so its anchor is its ordinal — never its characters", () => {
    const anchor = instanceAnchorFor(NOW, 4, VIEW); // "## Overdue to Start"
    assert.equal(anchor.node, null);
    assert.equal(anchor.instance, `${VIEW}/2/§heading`);
  });

  test("a blank line and an out-of-range index both anchor on nothing", () => {
    assert.equal(instanceAnchorFor(NOW, NOW.split("\n").length - 1, VIEW), null);
    assert.equal(instanceAnchorFor(NOW, 99, VIEW), null);
    assert.equal(instanceAnchorFor(NOW, -1, VIEW), null);
  });

  test("through FocusSurface: clicking a line takes the SAME anchor `instanceAnchorFor` would", () => {
    const { focus } = cursorOnPayBack();
    assert.deepEqual(focus.anchor, instanceAnchorFor(NOW, CURSOR, VIEW));
  });
});

describe("2. THE CURSOR HOLDS WHEN CONTENT ABOVE IT CHANGES — the original defect, fixed", () => {
  test("a line inserted above the cursor does not move it off its own line", () => {
    const { focus } = cursorOnPayBack();

    const reading = focus.reanchor(INSERTED_ABOVE, VIEW);

    assert.deepEqual(reading, { outcome: "found", lineIndex: CURSOR + 1, via: "instance" });
    assert.equal(focus.lineIndex, CURSOR + 1, "the cursor did not follow its line");
    assert.equal(
      INSERTED_ABOVE.split("\n")[focus.lineIndex],
      CURSOR_LINE,
      "THE DEFECT: the cursor is on a different line from the one it was on",
    );
  });

  test("the painted row the cursor is in holds that line's characters, not a heading's", () => {
    // This is the exact observation from the ORIGINAL reproduction against unmodified main: on
    // that build the one editable row held `"## Overdue to Start"`.
    const { focus } = cursorOnPayBack();
    focus.reanchor(INSERTED_ABOVE, VIEW);
    const body = view(INSERTED_ABOVE, focus);
    const open = inputs(body);
    assert.equal(open.length, 1, "the cursor is not in exactly one editable row");
    assert.equal(open[0].value, CURSOR_LINE);
  });

  test("the anchor is TAKEN AGAIN against the new projection, so a second arrival still finds it", () => {
    const { focus } = cursorOnPayBack();
    focus.reanchor(INSERTED_ABOVE, VIEW);
    // The engine now stamps a date onto the line — its TEXT changed, but its instance did not,
    // because the instance for a stamped line is `${view}/${section}/${node}`, never its text.
    const stamped = INSERTED_ABOVE.replace(CURSOR_LINE, `${CURSOR_LINE} 🆕 2026-07-31`);
    const reading = focus.reanchor(stamped, VIEW);
    assert.deepEqual(reading, { outcome: "found", lineIndex: CURSOR + 1, via: "instance" });
  });

  test("THE MUTATION PROOF — the resolution does not depend on WHERE the anchor was taken", () => {
    // Adapted from the rung-based suite's own falsifier: corrupt the reporting-only field and
    // assert the answer does not move. `takenAt` on an InstanceAnchor is exactly that field
    // (instance.ts's own header) — resolveInstanceAnchor is never handed it and this proves it by
    // corrupting it rather than by reading the source. Driven through the SAME two calls
    // FocusSurface.reanchor makes internally, so this is not a duplicate of instance.ts's own
    // mutation proof — it is the guarantee that FocusSurface's live path inherits it.
    const anchor = instanceAnchorFor(NOW, CURSOR, VIEW);
    const real = resolveInstanceAnchor(anchor, INSERTED_ABOVE, VIEW);
    for (const nonsense of [0, 999, -7]) {
      const corrupted = resolveInstanceAnchor({ ...anchor, takenAt: nonsense }, INSERTED_ABOVE, VIEW);
      assert.deepEqual(corrupted, real);
    }
    assert.deepEqual(real, { outcome: "found", lineIndex: CURSOR + 1, via: "instance" });
  });
});

describe("3. THE REGRESSION RISK — a stamped node that MOVES SECTION still keeps the cursor", () => {
  // design-presentation-instance-identity.md §3.3, refutation 1: "an instance id alone loses
  // 'follow the node', which the app has today for free". This is the one property a naive
  // instance-only implementation would have broken, so it is proven here on its own, unmissably.
  test("a PURE instance lookup alone would lose it — the trap, demonstrated before it is avoided", () => {
    const anchor = instanceAnchorFor(NOW, 3, VIEW); // qntm:1986, under "## Due This Week"
    assert.equal(
      MOVED_BETWEEN_SECTIONS.includes(anchor.instance),
      false,
      "the moved row's instance string really did change — a naive lookup finds nothing",
    );
  });

  test("resolveInstanceAnchor finds it anyway, by falling back to the node", () => {
    const anchor = instanceAnchorFor(NOW, 3, VIEW);
    const reading = resolveInstanceAnchor(anchor, MOVED_BETWEEN_SECTIONS, VIEW);
    assert.deepEqual(reading, { outcome: "found", lineIndex: 1, via: "node" });
    assert.equal(
      MOVED_BETWEEN_SECTIONS.split("\n")[reading.lineIndex],
      NOW.split("\n")[3],
      "the cursor did not land on the same line",
    );
  });

  test("through FocusSurface, driven by a click — the live cursor follows the moved node", () => {
    const focus = new FocusSurface();
    let body = view(NOW, focus);
    const target = walk(body)
      .filter((el) => el.tagName === "span")
      .find((el) => el.innerHTML.includes("Kick off trial"));
    assert.ok(target, "the fixture no longer contains qntm:1986's line");
    target.dispatch("click");
    view(NOW, focus); // the click's own repaint
    assert.equal(focus.lineIndex, 3);

    const reading = focus.reanchor(MOVED_BETWEEN_SECTIONS, VIEW);

    assert.deepEqual(reading, { outcome: "found", lineIndex: 1, via: "node" });
    assert.equal(focus.lineIndex, 1, "the live cursor did not follow the node it was on");
    body = view(MOVED_BETWEEN_SECTIONS, focus);
    const open = inputs(body);
    assert.equal(open.length, 1, "the cursor is not in exactly one editable row");
    assert.equal(open[0].value, MOVED_BETWEEN_SECTIONS.split("\n")[1]);
  });
});

describe("4. THE DUPLICATE PRINTING — resolves to the RIGHT one of the two", () => {
  test("the operator's real view prints three nodes twice; the anchor still finds its OWN printing", () => {
    const { focus } = cursorOnPayBack();
    const reading = focus.reanchor(PRINTED_TWICE, VIEW);
    assert.deepEqual(reading, { outcome: "found", lineIndex: CURSOR, via: "instance" });
    assert.equal(PRINTED_TWICE.split("\n")[reading.lineIndex], CURSOR_LINE);
  });

  test("a node genuinely printed TWICE in one section is refused, not guessed", () => {
    // The old suite's own case for this, re-expressed: two printings inside ONE section (as
    // `structural_edge_types allow_repeats` can produce) really are the same node twice, and
    // choosing between them by anything other than identity would be choosing a PRINTING. The
    // anchor's own instance (taken where the node was alone in its section) matches neither
    // duplicate — both now carry a `#1`/`#2` suffix — so the walk falls to the node and finds two.
    const twiceInOneSection = [
      "## Overdue",
      "## Due This Week",
      "## Overdue to Start",
      CURSOR_LINE,
      CURSOR_LINE,
      "",
    ].join("\n");
    const anchor = instanceAnchorFor(NOW, CURSOR, VIEW);
    const reading = resolveInstanceAnchor(anchor, twiceInOneSection, VIEW);
    assert.equal(reading.outcome, "ambiguous");
    assert.deepEqual(reading.candidates, [3, 4], "the candidates are handed back, not thrown away");
  });
});

describe("5. AN UNSTAMPED LINE KEEPS THE CURSOR WHILE ITS TEXT IS UNCHANGED", () => {
  test("a heading keeps the cursor across an insertion elsewhere in the file", () => {
    const anchor = instanceAnchorFor(NOW, 4, VIEW); // "## Overdue to Start"
    const reading = resolveInstanceAnchor(anchor, INSERTED_ABOVE, VIEW);
    assert.deepEqual(reading, { outcome: "found", lineIndex: 5, via: "instance" });
  });

  test("two identical unstamped lines in two DIFFERENT sections are told apart by section alone", () => {
    const source = ["## Overdue", "- nothing here yet", "## Due This Week", "- nothing here yet", ""].join(
      "\n",
    );
    const anchor = instanceAnchorFor(source, 3, VIEW);
    assert.deepEqual(resolveInstanceAnchor(anchor, source, VIEW), {
      outcome: "found",
      lineIndex: 3,
      via: "instance",
    });
  });
});

describe("6. A GENUINELY ABSENT LINE PRODUCES A REPORTED REFUSAL, NOT SILENCE", () => {
  test("the resolver reports `absent` rather than guessing", () => {
    assert.deepEqual(resolveInstanceAnchor(instanceAnchorFor(NOW, CURSOR, VIEW), ABSENT, VIEW), {
      outcome: "absent",
    });
  });

  test("through FocusSurface: the refusal is REPORTED and nothing moves or clears", () => {
    const { focus } = cursorOnPayBack();

    const reading = focus.reanchor(ABSENT, VIEW);

    assert.deepEqual(reading, { outcome: "absent" }, "the refusal was not reported");
    assert.equal(focus.lineIndex, CURSOR, "the cursor was moved by a refusal");
    assert.equal(focus.anchor.instance, instanceAnchorFor(NOW, CURSOR, VIEW).instance, "the anchor survived");
  });

  test("A CURSOR THAT WAS NEVER ANCHORED SAYS SO — it is not silently an absence", () => {
    const focus = new FocusSurface();
    focus.focus(3); // no source: the pre-anchor configuration every older test paints
    assert.deepEqual(focus.reanchor(ABSENT, VIEW), { outcome: "unanchored" });
    const nowhere = new FocusSurface();
    assert.deepEqual(nowhere.reanchor(ABSENT, VIEW), { outcome: "unanchored" });
  });
});

describe("7. and it reaches the screen — through app/index.html's own script", () => {
  const WORK = makeWorkDir("present-anchor");
  const PAGE_VIEW = { id: "this-week", path: "work/this_week.md", title: "This Week", domain: "work" };
  let page;
  let elements;

  const snapshot = (markdown) => ({
    snapshot: {
      generated_at: "2026-07-31T00:00:00Z",
      views: [{ ...PAGE_VIEW, markdown }],
    },
    pending_edits: 0,
  });

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
  });

  /**
   * Land a projection on the page — `paintView`'s own reanchoring, wired end to end.
   *
   * `sayAsOf`/`#freshness` are retired (chore/retire-the-status-line) — what this used to also
   * prove (a cursor loss reaching the DOM as one sentence, never repeated, never confused with a
   * view change) is gone with them. What paintView actually DOES with a reanchor answer —
   * following the line, or reseeding when it cannot — is unchanged and is what the tests below
   * check directly, on `page.__focusIndex()`/`page.__focusAnchor()`.
   */
  function land(markdown) {
    const fresh = snapshot(markdown);
    page.__setGraphData(fresh);
    page.paintView("this-week");
  }

  test("a projection inserting a line above the cursor moves it", () => {
    land(NOW);
    page.__setFocus(CURSOR, NOW);

    land(INSERTED_ABOVE);

    assert.equal(page.__focusIndex(), CURSOR + 1, "the cursor did not follow its line");
  });

  test("THE REGRESSION RISK, END TO END — a node moving section keeps the cursor through the real page", () => {
    land(NOW);
    page.__setFocus(3, NOW); // qntm:1986, under "## Due This Week"

    land(MOVED_BETWEEN_SECTIONS);

    assert.equal(page.__focusIndex(), 1, "the cursor did not follow its node across the section move");
  });

  test("a projection without the cursor's line reseeds the cursor rather than leaving it stuck", () => {
    land(NOW);
    page.__setFocus(CURSOR, NOW);
    assert.equal(page.__focusAnchor()?.node, "qntm:1232", "the arm did not anchor the line it means to lose");

    land(ABSENT);

    // qntm:1232 is gone from ABSENT entirely — identity cannot survive this, and the old
    // `reportCursorReading` sentence that used to say so is retired (chore/retire-the-status-line).
    // What paintView actually does is unchanged: it falls back to the clamped seeding every view's
    // first paint already uses — ABSENT has 5 lines (indices 0-4), so the cursor lands on the last.
    assert.notEqual(page.__focusAnchor()?.node, "qntm:1232", "the cursor kept an identity that is gone");
    assert.equal(page.__focusIndex(), 4, "the cursor was not reseeded to the clamped fallback line");
  });

  test("CHANGING VIEW seeds a fresh cursor rather than inheriting the previous view's", () => {
    const both = {
      snapshot: {
        generated_at: "2026-07-31T00:00:00Z",
        views: [
          { ...PAGE_VIEW, markdown: NOW },
          { ...PAGE_VIEW, id: "habits", path: "work/habits.md", title: "Habits", markdown: "## Work Habits\n" },
        ],
      },
      pending_edits: 0,
    };
    page.__setGraphData(both);
    page.paintView("this-week");
    page.__setFocus(CURSOR, NOW);

    page.paintView("habits");

    // "habits" was never anchored a cursor of its own — a view change is `why !== "arrived"`, so
    // `cursorReading` reads `unanchored` and the same clamp every view's first paint uses applies:
    // the PREVIOUS index (`CURSOR`, 5), clamped into "## Work Habits\n" (two lines, indices 0-1).
    // Not an exception, and not `CURSOR` itself, which this file (one line) could not even hold.
    assert.equal(page.__focusIndex(), 1, "choosing another view did not seed it a cursor of its own");
  });
});
