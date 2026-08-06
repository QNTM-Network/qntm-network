/**
 * A NEW LINE CAN BE MADE — the falsifier for the third source edit.
 *
 *   node --test tests/present-newline.test.mjs
 *
 * THE OPERATOR'S THREE ASKS, and they are sections 1, 2 and 3:
 *
 *   1. Enter at the end of a line makes a new one below it, and the cursor lands in it.
 *   2. Clicking the empty space below the last line makes a line there.
 *   3. The new line is whatever the cascade says it should be, in that view and that section.
 *
 * SECTION 4 IS THE ONE THAT IS NOT IN THE LIST. The whole feature is admissible only because
 * creating a line is an insertion into the SOURCE STRING at a known index — so the thing that has
 * to be proven is not "a row appeared" but "the file that got posted is the file the server sent
 * with EXACTLY ONE LINE INSERTED, every other line byte for byte". It is proven the way this repo
 * proves it: by wrecking the rendered DOM first and then using the affordance.
 *
 * SECTION 5 IS THE UNION. `SourceEdit` gained a third kind and it had to stay CLOSED — an earlier
 * defect in this repo had an unknown kind fall through to the checkbox branch and silently untick a
 * box. The refusal is asserted directly.
 *
 * SECTION 6 IS WHAT WAS DELIBERATELY NOT SHIPPED, pinned so that it is a decision rather than a
 * gap: no split at the caret, no line deletion, and no chaining of one Enter into the next.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, makeEvent, walk, serialize } from "./fixtures/dom-stub.mjs";
import {
  paint,
  applyEdit,
  seedFor,
  openLine,
  carriesContent,
  chromeOf,
  DraftSurface,
  FocusSurface,
  PresentationContext,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

/**
 * A CHECKBOX VIEW AND A PLAIN-LINE VIEW, and they are the pair the whole proof turns on.
 *
 * Both are what the engine actually PRINTS. The checkbox one is a `task`-typed view; the plain one
 * is the shape the engine's own starter `people` view emits (`config/views/people.yaml` declares
 * `default_node_type: person`, and `person`'s render shape is `plain_line`), verified by running a
 * real cycle against a hermetic copy of that bundle rather than copied from a guess.
 */
const CHECKBOX_VIEW = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task #work",
  "  - [x] sub-step done [[qntm:122]] #task",
  "",
  "## Notes",
  "prose that must not move",
].join("\n");

const PLAIN_VIEW = ["# People", "", "## people", "- Alice Example [[qntm:2]] #person", ""].join("\n");

/** Every section of the starter's daily-work view, and not one line in any of them. */
const EMPTY_VIEW = "## high-priority\n## capture\n## backlog\n";

function view(source, context = new PresentationContext()) {
  globalThis.document = makeDocument();
  const body = makeBody();
  const focus = new FocusSurface();
  const draft = new DraftSurface();
  const commits = [];
  const declined = [];
  paint(body, source, context, {
    markdown: md,
    focus,
    draft,
    onLineCommit: (commit) => commits.push(commit),
    onNewLineDeclined: (at) => declined.push(at),
  });
  return { body, focus, draft, commits, declined, source };
}

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");
const rows = (body) => body.children;
const trailing = (body) => body.children.filter((el) => el.className === "newline");
const taskText = (body) => walk(body).find((el) => el.tagName === "span");

/**
 * The commits that would actually have been POSTED.
 *
 * `onLineCommit` fires for every settlement, including the refusals — a line left unchanged, a new
 * line abandoned — and `markdown === null` is what "do not post" is spelled as. Pressing Enter in a
 * line therefore always produces a commit record before it opens anything, and counting records
 * rather than posts would make every assertion below one out.
 */
const posted = (v) => v.commits.filter((c) => c.markdown !== null);

/** Click a line's text, press Enter in the input that appears. Returns the draft input. */
function enterAtEndOfFirstTask(v) {
  taskText(v.body).dispatch("click");
  const line = inputs(v.body).find((el) => el.className === "rawline");
  line.dispatch("keydown", makeEvent({ key: "Enter" }));
  return inputs(v.body)[0];
}

describe("1. Enter makes a line below, and the cursor lands in it", () => {
  test("the operator's complaint, reproduced and then answered", () => {
    // "at the end of the line if I press return it just exits out of the line back to normal mode."
    // Without a draft surface that is still exactly what happens — which is what makes this a
    // falsifier and not a description.
    globalThis.document = makeDocument();
    const before = makeBody();
    const focus = new FocusSurface();
    paint(before, CHECKBOX_VIEW, new PresentationContext(), { markdown: md, focus });
    taskText(before).dispatch("click");
    inputs(before)[0].dispatch("keydown", makeEvent({ key: "Enter" }));
    assert.equal(inputs(before).length, 0, "the old surface unexpectedly kept a cursor somewhere");

    const v = view(CHECKBOX_VIEW);
    const draft = enterAtEndOfFirstTask(v);
    assert.ok(draft, "Enter produced no new line — THE COMPLAINT IS UNANSWERED");
    assert.equal(inputs(v.body).length, 1, "more than one row is editable");
    assert.equal(draft.focused, true, "the cursor did not land in the new line");
  });

  test("the new line sits directly below the one Enter was pressed in", () => {
    const v = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(v);
    assert.equal(v.draft.draft.lineIndex, 4, "the line did not open below line 3");
    // Row order on the page, not merely the index: heading, task, NEW LINE, task, heading, prose.
    const order = rows(v.body).map((el) => (el.className === "rawline" ? "NEW" : el.tagName));
    assert.deepEqual(order, ["h2", "h3", "label", "NEW", "label", "h3", "div", "div"]);
  });

  test("the source is NOT touched while the line is being made", () => {
    // The whole arrangement. Nothing is written until the row settles with characters in it, so an
    // abandoned line needs no deletion to undo and no intermediate file ever exists.
    const v = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(v);
    assert.deepEqual(posted(v), [], "opening a line posted something");
    assert.equal(v.source, CHECKBOX_VIEW);
  });

  test("Enter still commits the line it was pressed in", () => {
    const v = view(CHECKBOX_VIEW);
    taskText(v.body).dispatch("click");
    const line = inputs(v.body)[0];
    line.value = "- [x] Draft the launch note [[qntm:121]] #task #work";
    line.dispatch("keydown", makeEvent({ key: "Enter" }));
    assert.equal(posted(v).length, 1, "Enter stopped committing the line it was in");
    assert.equal(posted(v)[0].markdown.split("\n")[3], "- [x] Draft the launch note [[qntm:121]] #task #work");
    assert.ok(v.draft.draft, "Enter committed but opened no line");
  });

  test("it costs ONE repaint, the same as Enter has always cost", () => {
    // A cursor move costs two repaints (research-state-and-speed.md §3.3) and at 670 lines that is
    // ~98 ms. Enter costs one, and opening a line did not make it two: the commit and the opening
    // are both decided before anything is drawn. Counted by how many times the painter cleared the
    // column, which is once per paint.
    let paints = 0;
    globalThis.document = makeDocument();
    const body = makeBody();
    const realBody = body;
    Object.defineProperty(realBody, "innerHTML", {
      get: () => "",
      set: () => {
        paints += 1;
        realBody.children = [];
      },
      configurable: true,
    });
    paint(body, CHECKBOX_VIEW, new PresentationContext(), {
      markdown: md,
      focus: new FocusSurface(),
      draft: new DraftSurface(),
    });
    const opening = paints;
    taskText(body).dispatch("click");
    const afterClick = paints - opening;
    inputs(body)[0].dispatch("keydown", makeEvent({ key: "Enter" }));
    assert.equal(paints - opening - afterClick, 1, "Enter repainted more than once");
  });
});

describe("2. clicking below the last line makes a line there", () => {
  test("there is somewhere below the last line to click, and it is last", () => {
    const v = view(CHECKBOX_VIEW);
    const target = trailing(v.body);
    assert.equal(target.length, 1, "the column has no space below its last line");
    assert.equal(
      rows(v.body)[rows(v.body).length - 1], target[0],
      "the trailing target is not the last child — the exemption in tests/app-view-rows.test.mjs " +
        "rests on nothing being below it",
    );
  });

  test("clicking it opens a line after the last line, with the cursor in it", () => {
    const v = view(CHECKBOX_VIEW);
    trailing(v.body)[0].dispatch("click");
    // 8 lines, indices 0..7, so "after the last one" is index 8 — one past the end, which is the
    // index `insert-line` accepts and no other kind does.
    assert.equal(v.draft.draft.lineIndex, 8, "the line did not open after the last painted line");
    assert.equal(inputs(v.body)[0].focused, true, "the cursor did not land in it");
    assert.deepEqual(posted(v), [], "clicking below the last line posted something");
  });

  test("a trailing blank line does not push the new line past the end of the view", () => {
    // The engine ends every view with a newline, so `split` leaves an empty final element. The new
    // line goes after the last line that was DRAWN, which is what a person looking at the screen
    // expects, and it keeps the file's trailing newline where it was.
    const v = view(PLAIN_VIEW);
    trailing(v.body)[0].dispatch("click");
    const input = inputs(v.body)[0];
    input.value = "- Bob Example";
    input.dispatch("blur");
    assert.equal(posted(v)[0].markdown, "# People\n\n## people\n- Alice Example [[qntm:2]] #person\n- Bob Example\n");
  });

  test("without a draft surface the space below the last line does not exist", () => {
    globalThis.document = makeDocument();
    const body = makeBody();
    paint(body, CHECKBOX_VIEW, new PresentationContext(), { markdown: md, focus: new FocusSurface() });
    assert.equal(trailing(body).length, 0, "a painter with no draft surface built a create target");
  });
});

describe("3. the new line is what the cascade says, and the cascade says which rung", () => {
  test("THE PAIR WITH OPPOSITE OUTCOMES — a checkbox view and a plain-line view", () => {
    // The headline. Two views, the same gesture, two different lines, and neither is a special
    // case in the painter: what differs is what the ENGINE printed, which is what the cascade
    // already decided. `people.yaml` declares `default_node_type: person`; everything else
    // inherits GLOBAL `task`.
    const checkbox = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(checkbox);
    assert.equal(inputs(checkbox.body)[0].value, "- [ ] ", "a new line in a checkbox view is not a checkbox");

    const plain = view(PLAIN_VIEW);
    walk(plain.body).find((el) => el.tagName === "div").dispatch("click");
    inputs(plain.body)[0].dispatch("keydown", makeEvent({ key: "Enter" }));
    assert.equal(inputs(plain.body)[0].value, "- ", "a new line in a plain-line view got a checkbox");
  });

  test("the rung that answered is reported, and it is the most specific one that could", () => {
    // No `declared` argument in any of these — `cursorOffset` falls back to `text.length` (see
    // `NewLine.cursorOffset`'s own header), the same "cursor at the end" a caller with no
    // composition declaration always got.
    // LINE — the line directly above.
    assert.deepEqual(seedFor(CHECKBOX_VIEW, 4), { text: "- [ ] ", level: "LINE", tokens: [], cursorOffset: 6 });
    // STRUCTURAL_NODE — the section's own lines, reached by looking DOWN, because a line opened
    // directly under a heading has nothing above it inside its own section.
    assert.deepEqual(seedFor(CHECKBOX_VIEW, 3), {
      text: "- [ ] ",
      level: "STRUCTURAL_NODE",
      tokens: [],
      cursorOffset: 6,
    });
    // VIEW — the `## Notes` section has no node lines at all, so the answer comes from across a
    // heading. `## Notes` is at index 6; a line opened at 7 sits inside it.
    assert.deepEqual(seedFor(CHECKBOX_VIEW, 7), { text: "- [ ] ", level: "VIEW", tokens: [], cursorOffset: 6 });
    // GLOBAL — nothing in the view has ever been printed as a node, so nothing is resolved.
    assert.equal(seedFor(EMPTY_VIEW, 1), null);
  });

  test("the indent is inherited from the line above and from nowhere else", () => {
    // Enter at the end of a nested child makes its SIBLING. A section-level or view-level answer
    // carries no indent, because a stranger's nesting is not a fact about this line.
    assert.deepEqual(seedFor(CHECKBOX_VIEW, 5), { text: "  - [ ] ", level: "LINE", tokens: [], cursorOffset: 8 });
    assert.equal(seedFor("## a\n\n## b\n  - [ ] deep\n", 1)?.text, "- [ ] ");
  });

  test("a completed line above does not make a completed line below", () => {
    assert.equal(chromeOf("  - [x] done [[qntm:9]] #task"), "  - [ ] ");
  });

  test("a heading, a blank and a bullet-less line are not evidence of anything", () => {
    // The engine prints every node line with a bullet (`renderer.py:950`), so a line without one
    // is not something the cascade produced and mirroring it would be mirroring a guess.
    assert.equal(chromeOf("## Overdue"), null);
    assert.equal(chromeOf(""), null);
    assert.equal(chromeOf("prose that must not move"), null);
    assert.equal(chromeOf("- [ ] a task"), "- [ ] ");
    assert.equal(chromeOf("- a plain node line"), "- ");
  });

  test("THE EMPTY VIEW — nothing is opened, and the app says why rather than guessing", () => {
    // Measured against the engine, both available guesses cost the operator something and one of
    // them costs him the whole cycle: a checkbox line authored into the starter's `people` view
    // raises CycleAbortedError, because `person`'s fields are [title, qntm_id] and a checkbox sets
    // `status`. So nothing is written and the caller is told.
    const v = view(EMPTY_VIEW);
    trailing(v.body)[0].dispatch("click");
    assert.equal(v.draft.draft, null, "the app guessed a shape for a view it knows nothing about");
    assert.deepEqual(v.declined, [3], "the refusal was silent, which is the original complaint again");
    assert.deepEqual(v.commits, [], "a view with nothing in it produced a file to post");
  });

  test("a view with NO lines at all is the same state and behaves the same way", () => {
    const v = view("");
    assert.equal(trailing(v.body).length, 1, "an empty view offers nowhere to click");
    trailing(v.body)[0].dispatch("click");
    assert.equal(v.draft.draft, null);
    assert.deepEqual(v.declined, [0]);
  });
});

describe("4. the posted file is the source with exactly one line inserted", () => {
  /** Open a line below the first task, type `text`, blur. Returns what would have been posted. */
  function makeLine(text, source = CHECKBOX_VIEW) {
    const v = view(source);
    enterAtEndOfFirstTask(v);
    const input = inputs(v.body)[0];
    input.value = text;
    input.dispatch("blur");
    return { v, commit: v.commits[v.commits.length - 1] };
  }

  test("exactly one line is gained and every other line is byte-identical", () => {
    const { commit } = makeLine("- [ ] Book the venue");
    const before = CHECKBOX_VIEW.split("\n");
    const after = commit.markdown.split("\n");
    assert.equal(after.length, before.length + 1, "the file did not gain exactly one line");
    assert.equal(after[4], "- [ ] Book the venue");
    for (let i = 0; i < before.length; i += 1) {
      assert.equal(after[i < 4 ? i : i + 1], before[i], `line ${i} changed and should not have`);
    }
  });

  test("wreck every rendered element and the file still comes from the source", () => {
    // THE DOM-INVERSION DETECTOR for this affordance. A painter that rebuilt the file from the page
    // would pass every assertion above — it would reproduce the source exactly, right up until the
    // DOM stopped matching it. So the DOM is made to stop matching it first.
    const v = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(v);
    for (const el of walk(v.body)) {
      if (el.tagName === "span") el.innerHTML = "<b>TOTALLY DIFFERENT TEXT</b>";
      if (el.tagName === "h3") el.innerHTML = "WRECKED HEADING";
      if (el.tagName === "label") el.className = "wrecked";
      if (el.tagName === "div") el.innerHTML = "WRECKED PROSE";
    }
    const input = inputs(v.body)[0];
    input.value = "- [ ] Book the venue";
    input.dispatch("blur");

    const written = posted(v)[0].markdown;
    const after = written.split("\n");
    assert.ok(
      !written.includes("WRECKED") && !written.includes("TOTALLY DIFFERENT"),
      "the posted markdown carries text that only ever existed in the DOM — the app is " +
        "reconstructing markdown from the document, and it posts the WHOLE FILE",
    );
    const before = CHECKBOX_VIEW.split("\n");
    for (let i = 0; i < before.length; i += 1) {
      assert.equal(after[i < 4 ? i : i + 1], before[i], `line ${i} came from the page, not the source`);
    }
  });

  test("A LINE WITH NO CONTENT IS REFUSED, and that is the most important refusal here", () => {
    // Measured against a hermetic copy of the engine's starter bundle: `- [ ] ` with an empty title
    // MINTS A NODE. The cycle created qntm:3 titled "(untitled)" and then reprinted it into three
    // sections across two views, permanently. A wholly blank line is skipped by the input grammar
    // and is simply gone. Neither may ever be posted.
    for (const empty of ["- [ ] ", "- [ ]", "- ", "-", "", "   ", "  - [ ]   "]) {
      assert.equal(
        applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: 4, text: empty }),
        null,
        `insert-line accepted ${JSON.stringify(empty)}, which mints a node with no title`,
      );
    }
    // And through the surface, which is where it actually matters.
    const { v, commit } = makeLine("- [ ] ");
    assert.equal(commit.markdown, null, "an abandoned line produced a file to post");
    assert.equal(v.draft.draft, null, "the abandoned row is still on the page");
    assert.equal(inputs(v.body).length, 0);
  });

  test("the predicate that decides emptiness is the app's own grammar", () => {
    assert.equal(carriesContent("- [ ] a"), true);
    assert.equal(carriesContent("- [ ]  "), false);
    assert.equal(carriesContent("- a"), true);
    assert.equal(carriesContent("   *   "), false);
    assert.equal(carriesContent("## "), false);
    assert.equal(carriesContent("## Work"), true);
    assert.equal(carriesContent("a line with no bullet"), true);
  });

  test("Escape and Backspace abandon the line, and neither is a deletion", () => {
    for (const key of ["Escape", "Backspace"]) {
      const v = view(CHECKBOX_VIEW);
      enterAtEndOfFirstTask(v);
      inputs(v.body)[0].dispatch("keydown", makeEvent({ key }));
      assert.equal(v.draft.draft, null, `${key} did not abandon the line`);
      assert.deepEqual(posted(v), [], `${key} posted something`);
      assert.equal(v.source, CHECKBOX_VIEW, `${key} changed the source`);
    }
  });

  test("Backspace inside characters a person typed does what Backspace always does", () => {
    const v = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(v);
    const input = inputs(v.body)[0];
    input.value = "- [ ] Boo";
    input.dispatch("keydown", makeEvent({ key: "Backspace" }));
    assert.ok(v.draft.draft, "Backspace threw away a line that had characters in it");
  });

  test("one settlement per row, however many times the browser says so", () => {
    const v = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(v);
    const input = inputs(v.body)[0];
    input.value = "- [ ] Book the venue";
    input.dispatch("keydown", makeEvent({ key: "Enter" }));
    input.dispatch("blur");
    input.dispatch("blur");
    assert.equal(posted(v).length, 1, "the row settled more than once — that is a double POST");
  });

  test("the view returns to exactly what it was when a line is abandoned", () => {
    const v = view(CHECKBOX_VIEW);
    const before = serialize(v.body);
    trailing(v.body)[0].dispatch("click");
    inputs(v.body)[0].dispatch("keydown", makeEvent({ key: "Escape" }));
    assert.equal(serialize(v.body), before, "abandoning a line did not restore the view");
  });
});

describe("5. the union stayed closed", () => {
  test("an edit kind this function does not know is refused, not run", () => {
    // The defect this repo has already paid for: an unknown kind used to fall through to the
    // checkbox branch, and `edit.checked` being undefined meant it silently UNTICKED a box.
    const rogue = { kind: "delete-line", lineIndex: 3, checked: true, text: "x" };
    assert.equal(applyEdit(CHECKBOX_VIEW, rogue), null, "an unknown edit kind was executed");
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "", lineIndex: 3 }), null);
  });

  test("insert-line refuses a newline rather than splitting on it", () => {
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: 4, text: "a\nb" }), null);
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: 4, text: "a\r" }), null);
  });

  test("insert-line accepts one-past-the-end and refuses everything beyond it", () => {
    const lines = CHECKBOX_VIEW.split("\n").length;
    assert.ok(applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: lines, text: "- [ ] x" }));
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: lines + 1, text: "- [ ] x" }), null);
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: -1, text: "- [ ] x" }), null);
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "insert-line", lineIndex: 1.5, text: "- [ ] x" }), null);
  });

  test("the other two kinds are untouched", () => {
    assert.equal(
      applyEdit(CHECKBOX_VIEW, { kind: "set-checkbox", lineIndex: 3, checked: true }).split("\n")[3],
      "- [x] Draft the launch note [[qntm:121]] #task #work",
    );
    // A line may still be EMPTIED, and the asymmetry with insert-line is deliberate: emptying a
    // line that exists edits a node that exists, and the engine reprints that node's line from the
    // graph. Inserting an empty line creates a node with no title.
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "set-line", lineIndex: 3, text: "" }).split("\n")[3], "");
  });
});

describe("6. what was deliberately NOT shipped", () => {
  test("Enter does not split the line at the caret", () => {
    // Expressible, and not decided: a rendered qntm line carries its node's identity stamp, so a
    // split hands `[[qntm:121]]` to whichever half it falls in — renaming that node to a fragment
    // and minting a second node from the other. That is a graph decision and a keystroke with no
    // undo is not where it belongs.
    const v = view(CHECKBOX_VIEW);
    taskText(v.body).dispatch("click");
    const line = inputs(v.body)[0];
    line.selectionStart = 8;
    line.dispatch("keydown", makeEvent({ key: "Enter" }));
    assert.deepEqual(posted(v), [], "Enter mid-line changed the line it was in");
    assert.equal(inputs(v.body)[0].value, "- [ ] ", "Enter mid-line carried characters into the new line");
  });

  test("there is no way to delete a line — the union has no kind for it", () => {
    // NOT SHIPPED, ON PURPOSE. A rendered line carries `[[qntm:N]]`, so removing one is removing a
    // NODE, and this app has no undo. It is also not clear the gesture would even do what it looks
    // like: the engine rewrites every view from the graph on every cycle, so a node that still
    // qualifies for the section simply comes back.
    assert.equal(applyEdit(CHECKBOX_VIEW, { kind: "delete-line", lineIndex: 3 }), null);
    const v = view(CHECKBOX_VIEW);
    const target = walk(v.body).find((el) => el.tagName === "label");
    assert.deepEqual([...target.listeners.keys()], [], "a rendered line grew a listener of its own");
  });

  test("committing a line does not chain into another one", () => {
    // A commit is a whole-file POST that blocks on a full engine cycle, and the response repaints
    // the view from the server — so a line chained off a commit would be destroyed by the response
    // it is racing. Chaining needs the repaint to preserve the cursor, which is
    // research-state-and-speed.md §6.1's memoised-embodiment work. Named, not built.
    const v = view(CHECKBOX_VIEW);
    enterAtEndOfFirstTask(v);
    const input = inputs(v.body)[0];
    input.value = "- [ ] Book the venue";
    input.dispatch("keydown", makeEvent({ key: "Enter" }));
    assert.equal(v.draft.draft, null, "a committed line opened another one behind the POST");
    assert.equal(posted(v).length, 1);
  });
});

describe("7. THE GLOBAL RUNG BECOMES A READ — design-the-resolution-architecture.md step 6", () => {
  // Three headings, nothing printed under any of them — the exact shape EMPTY_VIEW already used,
  // renamed so `lineIndex` can point INSIDE a section's body rather than at a heading line itself.
  const EMPTY_SECTIONED_VIEW = "## high-priority\n\n## capture\n\n## backlog\n";
  // Same three headings, but "high-priority" now carries a PROSE line — not a bullet, so `chromeOf`
  // still finds no evidence in it, but it is exactly the kind of content a naive "peek at the text"
  // implementation could be fooled by. Section 3 below reads its own declared answer regardless.
  const CONTRADICTING_VIEW =
    "## high-priority\n\nsome prose that looks like nothing in particular\n\n## capture\n";

  const CHROME_SHAPES = { task: "checkbox", person: "plain_line" };

  /** A `GlobalRegistration` naming exactly one section of `daily-work`, the way `address.ts` and
   * `qualification.ts` publish it for real — `sections` carries ONLY the named section, mirroring
   * the operator's own `daily-work` (1 of 5 published) rather than a toy where every section answers. */
  function declared(sectionId, nodeType, chromeShapes = CHROME_SHAPES) {
    return {
      view: "daily-work",
      sectionOrder: { "daily-work": ["high-priority", "capture", "backlog"] },
      sections: { "daily-work": { [sectionId]: { nodeType } } },
      chromeShapes,
    };
  }

  test("a checkbox-shaped declared type seeds a checkbox, from an empty view", () => {
    // Line 1 is the blank line directly under `## high-priority` — the FIRST heading, ordinal 0.
    // `declared(...)` carries no `composition` — `cursorOffset` falls back to `text.length`.
    assert.deepEqual(seedFor(EMPTY_SECTIONED_VIEW, 1, declared("high-priority", "task")), {
      text: "- [ ] ",
      level: "GLOBAL",
      tokens: [],
      cursorOffset: 6,
    });
  });

  test("a plain-line declared type seeds a bare bullet, from the SAME empty view", () => {
    // Same source, same line, same section — only the declared node type differs. THE HEADLINE OF
    // THIS STEP: two views that print nothing still seed differently, because the DECLARATION says
    // so, not because anything was found on the page.
    assert.deepEqual(seedFor(EMPTY_SECTIONED_VIEW, 1, declared("high-priority", "person")), {
      text: "- ",
      level: "GLOBAL",
      tokens: [],
      cursorOffset: 2,
    });
  });

  test("printed text that contradicts the declaration is not consulted — the declaration wins", () => {
    // The whole point of proof standard #2: the ONLY node-adjacent-looking content in this view is
    // a prose line with no bullet, which `chromeOf` refuses as evidence (section 3 above already
    // proves that in isolation). The GLOBAL rung is reached exactly as it is for an empty view, and
    // answers from `declared` alone. Line 3 is the blank line after the prose, still inside
    // "high-priority" (ordinal 0 — the prose line carries no heading of its own).
    assert.deepEqual(seedFor(CONTRADICTING_VIEW, 3, declared("high-priority", "person")), {
      text: "- ",
      level: "GLOBAL",
      tokens: [],
      cursorOffset: 2,
    });
  });

  test("NO declared registration is the exact previous behaviour — the negative control", () => {
    // A caller that never mentions `GlobalRegistration` gets `null`, precisely as before this step.
    // This is what proves the new parameter is additive: every one of sections 1-6 above calls
    // `seedFor`/`openLine` with no fourth/fifth argument and none of them changed.
    assert.equal(seedFor(EMPTY_SECTIONED_VIEW, 1), null);
    assert.equal(seedFor(EMPTY_SECTIONED_VIEW, 1, undefined), null);
  });

  test("the refusal survives: the named section is not in the declared table", () => {
    // `declared("high-priority", ...)` only names "high-priority" — asking about "capture" (ordinal
    // 1) is exactly `daily-work`'s own real shape (1 of 5 sections published) and must still refuse,
    // never fall back to a neighbour's answer.
    const withOnlyHighPriority = declared("high-priority", "task");
    const captureLineIndex = 3; // the blank line under `## capture`
    assert.equal(seedFor(EMPTY_SECTIONED_VIEW, captureLineIndex, withOnlyHighPriority), null);
  });

  test("the refusal survives: the resolved type has no known chrome shape", () => {
    // A type the config uses as a default_node_type but whose render shape is `stat_line` or
    // `heading` (or simply a typo) is absent from `chromeShapes` on purpose — see resolutiontable.ts
    // and the generator's own header. `seedFor` must not guess a chrome form for it.
    assert.equal(seedFor(EMPTY_SECTIONED_VIEW, 1, declared("high-priority", "metric", {})), null);
  });

  test("the refusal survives: lineIndex cannot be addressed at all (above the first heading)", () => {
    // `sectionAt` returns `null` above the file's first heading — `declared` cannot rescue a
    // position L3 ADDRESSING itself refuses to name.
    assert.equal(seedFor("prose with no heading above it\n", 0, declared("high-priority", "task")), null);
  });

  test("printed evidence still wins outright over the declaration — the walk order is unchanged", () => {
    // A `declared` table that says "person" (plain-line) must not override real printed evidence
    // one section away. `CHECKBOX_VIEW` prints checkbox lines, so LINE/STRUCTURAL_NODE/VIEW answer
    // long before the GLOBAL rung is even reached, whatever `declared` claims.
    const misleading = { view: "daily-work", sectionOrder: {}, sections: {}, chromeShapes: {} };
    assert.deepEqual(seedFor(CHECKBOX_VIEW, 4, misleading), {
      text: "- [ ] ",
      level: "LINE",
      tokens: [],
      cursorOffset: 6,
    });
  });

  test("openLine threads `declared` through exactly the same way it threads everything else", () => {
    const draft = new DraftSurface();
    const declined = [];
    const opened = openLine(
      EMPTY_SECTIONED_VIEW,
      1,
      draft,
      (at) => declined.push(at),
      declared("high-priority", "task"),
    );
    assert.equal(opened, true, "openLine did not open the declared seed");
    assert.equal(draft.draft.seed, "- [ ] ");
    assert.deepEqual(declined, []);
  });

  test("openLine with no declared registration still declines, exactly as before", () => {
    const draft = new DraftSurface();
    const declined = [];
    const opened = openLine(EMPTY_SECTIONED_VIEW, 1, draft, (at) => declined.push(at));
    assert.equal(opened, false);
    assert.deepEqual(declined, [1]);
  });
});

describe("8. THE `o` SEED — the cursor lands where the TITLE belongs, not after the declared tag", () => {
  // The engine's own declared order (`resolution.composition`) — checkbox HEAD is
  // [checkbox, title], tail is [stamp, date, tags, markers, chrome]. See `scripts/compile-
  // resolution.mjs`'s own "COMPOSITION" header for the renderer.py citations this mirrors.
  const COMPOSITION = {
    heads: { checkbox: ["checkbox", "title"], plain_line: ["title"] },
    tail: ["stamp", "date", "tags", "markers", "chrome"],
    separator: " ",
  };

  const EMPTY_SECTIONED_VIEW = "## high-priority\n\n## capture\n\n## backlog\n";

  function declaredWithTokens(sectionId, nodeType, tokens, chromeShapes = { task: "checkbox", note: "plain_line" }) {
    return {
      view: "daily-work",
      sectionOrder: { "daily-work": ["high-priority", "capture", "backlog"] },
      sections: { "daily-work": { [sectionId]: { nodeType } } },
      chromeShapes,
      sectionRegistration: { "daily-work": { [sectionId]: { nodeType, tokens } } },
      composition: COMPOSITION,
    };
  }

  test("BEFORE THE FIX (documented, not exercised): the cursor sat at the string's end, AFTER " +
    "the tag — this is the shape that moved the operator's line under him on the next render", () => {
    // Without a `composition` declaration, cursorOffset falls back to text.length — the old
    // behaviour, preserved for a caller that predates this field. Shown here so the CONTRAST with
    // the fixed behaviour below is explicit, not implied.
    const noComposition = {
      view: "daily-work",
      sectionOrder: { "daily-work": ["high-priority"] },
      sections: { "daily-work": { "high-priority": { nodeType: "task" } } },
      chromeShapes: { task: "checkbox" },
      sectionRegistration: { "daily-work": { "high-priority": { nodeType: "task", tokens: ["#task"] } } },
    };
    const seed = seedFor(EMPTY_SECTIONED_VIEW, 1, noComposition);
    assert.equal(seed.text, "- [ ] #task ");
    assert.equal(seed.cursorOffset, seed.text.length, "old behaviour: cursor at the very end, after #task");
  });

  test("AFTER THE FIX: the cursor sits BEFORE the declared tag, where the title goes", () => {
    const seed = seedFor(EMPTY_SECTIONED_VIEW, 1, declaredWithTokens("high-priority", "task", ["#task"]));
    // Chrome is "- [ ] " (6 chars) — the cursor belongs immediately after it, before the reserved
    // separator that leads into the tag.
    assert.equal(seed.cursorOffset, 6);
    // Typing "Buy milk" AT that offset reproduces the engine's own title-before-tag order exactly.
    const typed = seed.text.slice(0, seed.cursorOffset) + "Buy milk" + seed.text.slice(seed.cursorOffset);
    assert.equal(typed, "- [ ] Buy milk #task");
  });

  test("plain_line shape: the cursor sits right after the bullet, before the tag", () => {
    const seed = seedFor(EMPTY_SECTIONED_VIEW, 1, declaredWithTokens("high-priority", "note", ["#note"]));
    assert.equal(seed.cursorOffset, 2);
    const typed = seed.text.slice(0, seed.cursorOffset) + "A note" + seed.text.slice(seed.cursorOffset);
    assert.equal(typed, "- A note #note");
  });

  test("no declared tokens at all: the cursor still lands at the end (nothing to place it before)", () => {
    const seed = seedFor(EMPTY_SECTIONED_VIEW, 1, declaredWithTokens("high-priority", "task", []));
    assert.equal(seed.text, "- [ ] ");
    assert.equal(seed.cursorOffset, 6, "with no tokens the title-slot and the string's end coincide");
  });

  test("multiple declared tokens: they all follow the title, in the engine's own order", () => {
    const seed = seedFor(
      EMPTY_SECTIONED_VIEW,
      1,
      declaredWithTokens("high-priority", "task", ["#task", "#personal"]),
    );
    assert.equal(seed.cursorOffset, 6);
    const typed = seed.text.slice(0, seed.cursorOffset) + "Call mum" + seed.text.slice(seed.cursorOffset);
    assert.equal(typed, "- [ ] Call mum #task #personal");
  });

  test("openLine carries cursorOffset into the DraftSurface", () => {
    const draft = new DraftSurface();
    const opened = openLine(
      EMPTY_SECTIONED_VIEW,
      1,
      draft,
      undefined,
      declaredWithTokens("high-priority", "task", ["#task"]),
    );
    assert.equal(opened, true);
    // The seed carries a reserved double space at the title slot — one from the checkbox's own
    // trailing separator, one from the separator reserved between the (not-yet-typed) title and the
    // tag. Both collapse into a single, correctly-placed space the instant the operator types.
    assert.equal(draft.draft.seed, "- [ ]  #task");
    assert.equal(draft.draft.cursorOffset, 6);
  });
});
