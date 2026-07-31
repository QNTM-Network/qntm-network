/**
 * THE HAVEN ROW 2 FALSIFIER — the cursor anchors to a NODE, not to a line number.
 *
 *   node --test tests/present-anchor.test.mjs
 *
 * ── WHAT WAS REPRODUCED FIRST, ON UNMODIFIED `origin/main` (f349b94) ──
 *
 * Both arms below were run against the SHIPPED `dist/present.js` through this repo's own DOM stub
 * before a line of `anchor.ts` existed, from fixtures built out of `~/qntm/this_week.md`:
 *
 *   ARM 4  focus.lineIndex = 5, the operator has typed into that line. A cycle inserts ONE line
 *          into `## Overdue`, above him. Repaint.
 *            -> focus.lineIndex = 5, one editable row, and its value is `"## Overdue to Start"`.
 *               A HEADING. The typing is gone. Nothing reported to any callback.
 *   ARM 5  the same cursor; his node has left the view. Repaint.
 *            -> focus.lineIndex = 5, ZERO editable rows painted, the cursor is nowhere on screen,
 *               and again nothing reported to any callback.
 *
 * Sections 3 and 4 are those two arms, re-run against the anchored surface, asserting the outcome
 * the row asks for: the cursor lands on the SAME LINE, and tier 3 produces a REPORTED REFUSAL
 * rather than silence. Section 5 drives the shipped page itself, so the refusal is proven to reach
 * the screen and not merely a callback.
 *
 * ── THE FIXTURES ARE THE OPERATOR'S OWN LINES ──
 *
 * Verbatim from `~/qntm/this_week.md` and `~/qntm/habits.md` (read-only, 2026-07-31), because two
 * of the things this module has to get right are only visible in real content: a view that prints
 * ONE NODE TWICE (this_week.md does it three times over, 6 of its 15 node lines), and a line whose
 * `[[qntm:N]]` is malformed by a typo the operator actually has (`habits.md:19`, `[qntm:1507]]`).
 *
 * ── WHAT THIS DOES NOT PROVE ──
 *
 * No browser laid anything out, no passkey session was opened, no server was contacted and no
 * projection was ever observed arriving from a real cycle. Every "projection" here is a second
 * string in this file. The claim is about what the modules do when handed one.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk } from "./fixtures/dom-stub.mjs";
import { importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";
import {
  ANCHOR_TRUST,
  FocusSurface,
  PresentationContext,
  anchorFor,
  paint,
  resolveAnchor,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

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
// same node.
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
// printings apart; the SECTION does.
const PRINTED_TWICE = [
  ...NOW.split("\n").slice(0, 9),
  "## Scheduled This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "",
].join("\n");

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");

/** Paint with a focus surface, the way the page does. */
function view(source, focus, reports = []) {
  globalThis.document = makeDocument();
  const body = makeBody();
  paint(body, source, new PresentationContext(), {
    markdown: md,
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

describe("1. the anchor is identity, and it is taken off the line rather than off the index", () => {
  test("a stamped line anchors on its own stamp, its text and its section", () => {
    const anchor = anchorFor(NOW, CURSOR);
    assert.deepEqual(anchor, {
      stamp: "[[qntm:1232]]",
      text: CURSOR_LINE,
      section: "## Overdue to Start",
      takenAt: CURSOR,
    });
  });

  test("a heading has no stamp, so it anchors on its text — tier 2's whole reason to exist", () => {
    const anchor = anchorFor(NOW, 4);
    assert.equal(anchor.stamp, null);
    assert.equal(anchor.text, "## Overdue to Start");
    assert.equal(anchor.section, "## Due This Week", "a heading's section is the heading above it");
  });

  test("a blank line has NO identity and says so, rather than anchoring on a text every other blank line shares", () => {
    assert.equal(anchorFor(NOW, NOW.split("\n").length - 1), null);
    assert.equal(anchorFor("- [ ] a [[qntm:1]] #task\n   \n", 1), null, "whitespace-only is blank too");
  });

  test("an index outside the source anchors on nothing", () => {
    assert.equal(anchorFor(NOW, 99), null);
    assert.equal(anchorFor(NOW, -1), null);
  });

  test("the operator's own malformed stamp is not a stamp — `[qntm:1507]]` has one bracket", () => {
    // ~/qntm/habits.md:19, read-only. The line carries a typo AND a real stamp; the real one wins
    // and the typo is left in the text, where tier 2 can still see it.
    const line =
      "    - [ ] Started in last 30 days email [qntm:1507]] [[qntm:2423]] #routine #work #every-14d 🛫 2026-07-28";
    const anchor = anchorFor(`## Work Habits\n${line}\n`, 1);
    assert.equal(anchor.stamp, "[[qntm:2423]]");
  });

  test("the FIRST stamp is the node's own — chrome cells are printed after it", () => {
    // ~/qntm/habits.md:24, read-only. `#requires [[JB to send over Sarasin]]` is an outgoing edge
    // and is not an identity stamp at all, so it is not even a candidate here; a line carrying two
    // `[[qntm:N]]`s would still take the first, which is where the renderer puts identity.
    const line =
      "    - [x] Store all somewhere [[qntm:1723]] #task #work ✅ 2026-07-13 🆕 2026-07-07 #requires [[JB to send over Sarasin]]";
    assert.equal(anchorFor(`## Work Habits\n${line}\n`, 1).stamp, "[[qntm:1723]]");
  });
});

describe("2. the rungs, and which one answered", () => {
  test("TIER 1 — a unique stamp, and the index it was taken at is NOT what found it", () => {
    const anchor = anchorFor(NOW, CURSOR);
    assert.deepEqual(resolveAnchor(anchor, INSERTED_ABOVE), {
      outcome: "found",
      tier: "STAMP",
      lineIndex: CURSOR + 1,
    });
  });

  test("THE MUTATION PROOF — corrupt `takenAt` and the answer does not move", () => {
    // If the resolver were secretly rebasing an index rather than reading identity, this is where
    // it would show. `takenAt` is a reporting field and nothing else.
    const anchor = anchorFor(NOW, CURSOR);
    for (const nonsense of [0, 999, -7]) {
      assert.deepEqual(resolveAnchor({ ...anchor, takenAt: nonsense }, INSERTED_ABOVE), {
        outcome: "found",
        tier: "STAMP",
        lineIndex: CURSOR + 1,
      });
    }
  });

  test("TIER 1 SURVIVES A MOVE BETWEEN SECTIONS, which is what index arithmetic cannot do", () => {
    const anchor = anchorFor(NOW, 3); // `qntm:1986`, under `## Due This Week`
    const reading = resolveAnchor(anchor, MOVED_BETWEEN_SECTIONS);
    assert.deepEqual(reading, { outcome: "found", tier: "STAMP", lineIndex: 1 });
    assert.equal(
      MOVED_BETWEEN_SECTIONS.split("\n")[reading.lineIndex],
      NOW.split("\n")[3],
      "the cursor did not land on the same line",
    );
  });

  test("TIER 1 does not require the section to agree — a renamed heading has not moved the line", () => {
    const renamed = NOW.replace("## Overdue to Start", "## Overdue To Start (renamed by a rule)");
    assert.deepEqual(resolveAnchor(anchorFor(NOW, CURSOR), renamed), {
      outcome: "found",
      tier: "STAMP",
      lineIndex: CURSOR,
    });
  });

  test("TIER 1 NARROWED BY SECTION — the operator's real view prints three nodes twice", () => {
    const anchor = anchorFor(NOW, CURSOR);
    const reading = resolveAnchor(anchor, PRINTED_TWICE);
    assert.deepEqual(reading, { outcome: "found", tier: "STAMP_IN_SECTION", lineIndex: CURSOR });
    assert.equal(PRINTED_TWICE.split("\n")[reading.lineIndex], CURSOR_LINE);
  });

  test("TIER 2 — no stamp on the line, so its exact text answers", () => {
    const anchor = anchorFor(NOW, 4); // `## Overdue to Start`
    assert.deepEqual(resolveAnchor(anchor, INSERTED_ABOVE), {
      outcome: "found",
      tier: "TEXT",
      lineIndex: 5,
    });
  });

  test("TIER 2 — a stamped line whose stamp is NOT in the projection falls through to its text", () => {
    // A rung that finds NOTHING passes. The engine has re-stamped the line; the characters are the
    // only thing left that identifies it.
    const restamped = NOW.replace("[[qntm:1232]]", "[[qntm:9001]]");
    const anchor = anchorFor(restamped, CURSOR);
    assert.equal(anchor.stamp, "[[qntm:9001]]");
    assert.deepEqual(resolveAnchor({ ...anchor, text: CURSOR_LINE }, NOW), {
      outcome: "found",
      tier: "TEXT",
      lineIndex: CURSOR,
    });
  });

  test("TIER 2 NARROWED BY SECTION — two identical unstamped lines in two sections", () => {
    const source = [
      "## Overdue",
      "- nothing here yet",
      "## Due This Week",
      "- nothing here yet",
      "",
    ].join("\n");
    assert.deepEqual(resolveAnchor(anchorFor(source, 3), source), {
      outcome: "found",
      tier: "TEXT_IN_SECTION",
      lineIndex: 3,
    });
  });

  test("AMBIGUOUS IS A THIRD OUTCOME — one node printed twice inside ONE section is refused, not guessed", () => {
    const twiceInOneSection = [
      "## Overdue to Start",
      CURSOR_LINE,
      "- [ ] Get summer suit [[qntm:2412]] #outcome #personal 🆕 2026-07-27",
      CURSOR_LINE,
      "",
    ].join("\n");
    const reading = resolveAnchor(anchorFor(NOW, CURSOR), twiceInOneSection);
    assert.equal(reading.outcome, "ambiguous");
    assert.equal(reading.tier, "STAMP");
    assert.deepEqual(reading.candidates, [1, 3], "the candidates are handed back, not thrown away");
  });

  test("AN AMBIGUOUS STRONG RUNG DOES NOT FALL THROUGH TO A WEAKER ONE", () => {
    // Two printings of one node whose TEXT differs — a cycle stamped a date onto one of them. The
    // text would break the tie; using it would be settling a node's identity with its characters,
    // so the walk stops at the rung that matched.
    const twiceInOneSection = [
      "## Overdue to Start",
      CURSOR_LINE,
      `${CURSOR_LINE} 🆕 2026-07-31`,
      "",
    ].join("\n");
    const reading = resolveAnchor(anchorFor(NOW, CURSOR), twiceInOneSection);
    assert.equal(reading.outcome, "ambiguous");
    assert.equal(reading.tier, "STAMP");
  });

  test("TIER 3 — the line is not in this projection, and that is REPORTED", () => {
    assert.deepEqual(resolveAnchor(anchorFor(NOW, CURSOR), ABSENT), { outcome: "absent" });
  });

  test("the trust order is exported ordered, so a caller never re-derives it from a comment", () => {
    assert.deepEqual(ANCHOR_TRUST, ["STAMP", "STAMP_IN_SECTION", "TEXT", "TEXT_IN_SECTION"]);
  });
});

describe("3. THE FALSIFIER, ARM 4 — a line is inserted above the cursor", () => {
  test("the cursor lands on the SAME LINE, by identity, and its index moved to say so", () => {
    const { focus } = cursorOnPayBack();

    const reading = focus.reanchor(INSERTED_ABOVE);

    assert.deepEqual(reading, { outcome: "found", tier: "STAMP", lineIndex: CURSOR + 1 });
    assert.equal(focus.lineIndex, CURSOR + 1, "the cursor did not follow its line");
    assert.equal(
      INSERTED_ABOVE.split("\n")[focus.lineIndex],
      CURSOR_LINE,
      "THE DEFECT: the cursor is on a different line from the one it was on",
    );
  });

  test("the painted row the cursor is in holds that line's characters, not a heading's", () => {
    // This is the exact observation from the reproduction: on unmodified main the one editable row
    // held `"## Overdue to Start"`.
    const { focus } = cursorOnPayBack();
    focus.reanchor(INSERTED_ABOVE);
    const body = view(INSERTED_ABOVE, focus);
    const open = inputs(body);
    assert.equal(open.length, 1, "the cursor is not in exactly one editable row");
    assert.equal(open[0].value, CURSOR_LINE);
  });

  test("the anchor is TAKEN AGAIN against the new projection, so a second arrival still finds it", () => {
    const { focus } = cursorOnPayBack();
    focus.reanchor(INSERTED_ABOVE);
    // The engine now stamps a date onto the line. Tier 1 still answers; what would have gone stale
    // is tier 2's text, and re-taking the anchor is what keeps it current.
    const stamped = INSERTED_ABOVE.replace(CURSOR_LINE, `${CURSOR_LINE} 🆕 2026-07-31`);
    assert.equal(focus.reanchor(stamped).outcome, "found");
    assert.equal(focus.anchor.text, `${CURSOR_LINE} 🆕 2026-07-31`);
  });
});

describe("4. THE FALSIFIER, ARM 5 — the cursor's line is absent from the projection", () => {
  test("tier 3 produces a REPORTED REFUSAL rather than silence", () => {
    const { focus } = cursorOnPayBack();

    const reading = focus.reanchor(ABSENT);

    assert.deepEqual(reading, { outcome: "absent" }, "the refusal was not reported");
  });

  test("the refusal moves nothing and clears nothing — row 4 needs what is left behind", () => {
    const { focus } = cursorOnPayBack();
    focus.reanchor(ABSENT);
    assert.equal(focus.lineIndex, CURSOR, "the cursor was moved by a refusal");
    assert.equal(focus.anchor.text, CURSOR_LINE, "the anchor was thrown away with the line");
  });

  test("A CURSOR THAT WAS NEVER ANCHORED SAYS SO — it is not silently an absence", () => {
    const focus = new FocusSurface();
    focus.focus(3); // no source: the pre-anchor configuration every older test paints
    assert.deepEqual(focus.reanchor(ABSENT), { outcome: "unanchored" });
    const nowhere = new FocusSurface();
    assert.deepEqual(nowhere.reanchor(ABSENT), { outcome: "unanchored" });
  });
});

describe("5. and it reaches the screen — through app/index.html's own script", () => {
  const WORK = makeWorkDir("present-anchor");
  const VIEW = { id: "this-week", path: "work/this_week.md", title: "This Week", domain: "work" };
  let page;
  let elements;

  const snapshot = (markdown) => ({
    snapshot: {
      generated_at: "2026-07-31T00:00:00Z",
      views: [{ ...VIEW, markdown }],
    },
    pending_edits: 0,
  });

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
  });

  /**
   * Land a projection on the page and read the freshness line the way the operator gets it.
   *
   * THROUGH `sayAsOf`, ALWAYS, because that is what every write path in the page does one statement
   * after `paintView` — `toggleTask`, `commitLine`, `refresh` and `applySnapshot` all do it. Reading
   * the element between the two would be reading a line the app never leaves on the screen.
   */
  function land(markdown) {
    const fresh = snapshot(markdown);
    page.__setGraphData(fresh);
    page.paintView("this-week");
    page.__sayAsOf(fresh);
    return elements.get("freshness").textContent;
  }

  test("a projection inserting a line above the cursor moves it, and says nothing about it", () => {
    land(NOW);
    page.__setFocus(CURSOR, NOW);

    const said = land(INSERTED_ABOVE);

    assert.equal(page.__focusIndex(), CURSOR + 1, "the cursor did not follow its line");
    assert.match(said, /^as of .* · 0 queued$/, `an ordinary re-anchor narrated itself: ${said}`);
  });

  test("a projection without the cursor's line puts ONE SENTENCE in the freshness line", () => {
    land(NOW);
    page.__setFocus(CURSOR, NOW);

    const said = land(ABSENT);

    // The failure this also guards against is the refusal being reported into a line that is
    // overwritten one statement later — the same silence, one layer up.
    assert.match(said, /^as of .* · 0 queued · the line you were on is not in this view any more$/, said);
  });

  test("the sentence describes ONE arrival — the next projection does not repeat it", () => {
    land(NOW);
    page.__setFocus(CURSOR, NOW);
    land(ABSENT);

    const said = land(ABSENT);

    assert.match(said, /^as of .* · 0 queued$/, `a stale note followed the next projection: ${said}`);
  });

  test("CHANGING VIEW is not a projection arriving, and is not reported as one", () => {
    const both = {
      snapshot: {
        generated_at: "2026-07-31T00:00:00Z",
        views: [
          { ...VIEW, markdown: NOW },
          { ...VIEW, id: "habits", path: "work/habits.md", title: "Habits", markdown: "## Work Habits\n" },
        ],
      },
      pending_edits: 0,
    };
    page.__setGraphData(both);
    page.paintView("this-week");
    page.__setFocus(CURSOR, NOW);

    page.paintView("habits");
    page.__sayAsOf(both);

    assert.match(
      elements.get("freshness").textContent,
      /^as of .* · 0 queued$/,
      "choosing another view was reported as having lost the cursor",
    );
  });
});
