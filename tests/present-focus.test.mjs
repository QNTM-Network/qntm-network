/**
 * THE STAGE 3 FALSIFIER — the operator's cursor rule, and the source string still the truth.
 *
 *   node --test tests/present-focus.test.mjs
 *
 * THE RULE: cursor on the line and you see `- [ ]`; cursor off it and you see a rendered,
 * clickable checkbox. The design names three assertions and they are sections 1, 2 and 3 below:
 *
 *   1. focus a line -> the DOM carries the VERBATIM source substring
 *   2. blur         -> the checkbox returns
 *   3. edit + blur  -> the posted markdown is the source with EXACTLY that line replaced
 *
 * SECTION 4 IS THE ONE THAT IS NOT IN THE LIST, AND IT IS THE ONE THAT MATTERS MOST. Stage 1
 * found that a naive DOM inversion passes a byte-identical golden and every ordinary assertion —
 * it reproduces the source exactly, right up until the DOM stops matching it. The only test that
 * catches it corrupts the DOM first and then checks what got posted. Stage 1 has that test for
 * the checkbox; this is its equivalent for a surface that is INHERENTLY closer to the line: an
 * editable element whose value is read back. Section 4 wrecks every other rendered element,
 * edits one line, and asserts the other forty are byte-identical to the SOURCE, not to the page.
 *
 * SECTION 5 IS THE PRECEDENCE PROOF. FOCUS is the most specific of the seven levels, so the
 * cursor beats a GLOBAL declaration of `wired`. Without that ordering a declaration could make a
 * line uneditable, which is the failure the level order exists to prevent.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import {
  makeDocument,
  makeBody,
  makeEvent,
  walk,
  serialize,
  VIEW_MARKDOWN,
} from "./fixtures/dom-stub.mjs";
import {
  paint,
  applyEdit,
  FocusSurface,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

const SOURCE = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
  "  - [x] sub-step done [[qntm:122]] #task",
  "prose that must not move",
  "| a | b |",
  "",
].join("\n");

/** Paint with a focus surface, the way app.html does. Returns everything a test needs to drive. */
function view(source = SOURCE, context = new PresentationContext()) {
  globalThis.document = makeDocument();
  const body = makeBody();
  const focus = new FocusSurface();
  const commits = [];
  const deps = {
    markdown: md,
    focus,
    onCheckboxToggle: () => {},
    onLineCommit: (commit) => commits.push(commit),
  };
  paint(body, source, context, deps);
  return { body, focus, commits };
}

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");
const boxes = (body) => walk(body).filter((el) => el.type === "checkbox");
/** The clickable text of the first task line — the cursor target app.html paints. */
const taskText = (body) => walk(body).find((el) => el.tagName === "span");

describe("1. the cursor lands and the line shows its source", () => {
  test("clicking the text of a task line replaces it with its verbatim source", () => {
    const v = view();
    assert.equal(inputs(v.body).length, 0, "a line was editable before anything was clicked");

    taskText(v.body).dispatch("click");

    const [line] = inputs(v.body);
    assert.ok(line, "clicking a task line produced no editable line — THERE IS NO SURFACE");
    assert.equal(line.value, "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29");
    assert.equal(line.className, "rawline");
    assert.equal(v.focus.lineIndex, 3);
  });

  test("the DOM carries the verbatim source substring, glyph, tokens, marker and all", () => {
    const v = view();
    taskText(v.body).dispatch("click");
    const painted = serialize(v.body);
    for (const substring of ["- [ ] ", "[[qntm:121]]", "#task", "#work", "🆕 2026-07-29"]) {
      assert.ok(painted.includes(substring), `the focused line lost ${substring}`);
    }
  });

  test("the cursor is actually put in the line, not merely rendered beside it", () => {
    // `focus()` on an element that is not in the document does nothing, so this pins the ORDER
    // the painter appends and focuses in. Without it the line would render as source and the
    // person would have to click it a second time.
    const v = view();
    taskText(v.body).dispatch("click");
    assert.equal(inputs(v.body)[0].focused, true, "the input was never focused");
  });

  test("only the focused line changes — every other line keeps its rendition", () => {
    const v = view();
    taskText(v.body).dispatch("click");
    assert.equal(inputs(v.body).length, 1, "focusing one line made more than one line editable");
    assert.equal(boxes(v.body).length, 1, "the other task line lost its checkbox");
    assert.ok(walk(v.body).some((el) => el.tagName === "h3"), "a heading lost its rendition");
  });

  test("a heading and a prose line are cursor targets too", () => {
    for (const [tagName, expected] of [
      ["h3", "## Overdue"],
      ["div", "prose that must not move"],
    ]) {
      const v = view();
      const target = walk(v.body).find((el) => el.tagName === tagName);
      target.dispatch("click");
      assert.ok(
        inputs(v.body).some((el) => el.value === expected),
        `clicking a <${tagName}> did not show ${JSON.stringify(expected)}`,
      );
    }
  });

  test("clicking the text of a task does not also tick it", () => {
    // A <label> forwards a click to its control, so without preventDefault the gesture that
    // reads a line would also complete it. Asserted on the event the painter was handed.
    const v = view();
    const event = taskText(v.body).dispatch("click", makeEvent());
    assert.equal(event.defaultPrevented, true, "the label's default action was left to fire");
    assert.equal(event.propagationStopped, true);
  });

  test("a blank line is not a cursor target, and that is not an oversight", () => {
    // A blank line has no rendition at either end — it vanishes — so there is nothing to click
    // and nothing to resolve between. Pinned so a later change that starts painting blanks has
    // to say so.
    const v = view();
    assert.equal(walk(v.body).filter((el) => el.tagName === "div").length, 2);
  });
});

describe("2. the cursor leaves and the rendition returns", () => {
  test("blur returns the checkbox", () => {
    const v = view();
    const before = serialize(v.body);
    taskText(v.body).dispatch("click");
    assert.equal(boxes(v.body).length, 1);

    inputs(v.body)[0].dispatch("blur");

    assert.equal(boxes(v.body).length, 2, "the checkbox did not come back after blur");
    assert.equal(inputs(v.body).length, 0, "the line is still editable after blur");
    assert.equal(v.focus.lineIndex, null);
    assert.equal(serialize(v.body), before, "the view did not return to what it was");
  });

  test("Escape returns the rendition and drops what was typed", () => {
    const v = view();
    const before = serialize(v.body);
    taskText(v.body).dispatch("click");
    const line = inputs(v.body)[0];
    line.value = "- [ ] something else entirely";
    line.dispatch("keydown", makeEvent({ key: "Escape" }));

    assert.deepEqual(v.commits, [], "Escape posted an edit");
    assert.equal(serialize(v.body), before, "Escape did not restore the view");
  });

  test("Enter commits and returns the rendition", () => {
    const v = view();
    taskText(v.body).dispatch("click");
    const line = inputs(v.body)[0];
    line.value = "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-31";
    const event = line.dispatch("keydown", makeEvent({ key: "Enter" }));

    assert.equal(event.defaultPrevented, true);
    assert.equal(v.commits.length, 1);
    assert.equal(inputs(v.body).length, 0, "Enter left the line editable");
    assert.equal(v.focus.lineIndex, null);
  });

  test("leaving a line untouched posts nothing at all", () => {
    // The commonest thing a cursor does. A file POSTed to say nothing is a whole view
    // overwritten with a stale copy of itself.
    const v = view();
    taskText(v.body).dispatch("click");
    inputs(v.body)[0].dispatch("blur");
    assert.equal(v.commits.length, 1);
    assert.equal(v.commits[0].markdown, null, "an unchanged line produced a file to post");
  });

  test("one settlement per line, however many times the browser says so", () => {
    // Enter commits, and the repaint that follows removes the element — which can fire blur on
    // the way out. A second settlement would compute a second edit against a source that has
    // already moved: the first shape a double POST takes.
    const v = view();
    taskText(v.body).dispatch("click");
    const line = inputs(v.body)[0];
    line.value = "- [x] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29";
    line.dispatch("keydown", makeEvent({ key: "Enter" }));
    line.dispatch("blur");
    line.dispatch("blur");
    assert.equal(v.commits.length, 1, "the line settled more than once");
  });
});

describe("3. the posted file is the source with exactly that line replaced", () => {
  /** Focus line 3, type `text`, blur. Returns the commit the caller would have posted. */
  function editFirstTask(text, source = SOURCE) {
    const v = view(source);
    taskText(v.body).dispatch("click");
    const line = inputs(v.body)[0];
    line.value = text;
    line.dispatch("blur");
    return { v, commit: v.commits[0] };
  }

  test("exactly one line differs, and it is the line that was edited", () => {
    const { commit } = editFirstTask("- [x] Draft the launch note [[qntm:121]] #task #work ✅ 2026-07-30");
    const before = SOURCE.split("\n");
    const after = commit.markdown.split("\n");

    assert.equal(after.length, before.length, "the file gained or lost lines");
    const changed = before.map((_, i) => i).filter((i) => before[i] !== after[i]);
    assert.deepEqual(changed, [3], "more than one line changed");
    assert.equal(after[3], "- [x] Draft the launch note [[qntm:121]] #task #work ✅ 2026-07-30");
  });

  test("every other line is byte-identical, including the blank ones", () => {
    // Not "the changed line is right" — the whole file, line for line. The app posts the WHOLE
    // FILE and the server overwrites it, so the other lines are the risk.
    const { commit } = editFirstTask("- [ ] a completely different sentence");
    const before = SOURCE.split("\n");
    const after = commit.markdown.split("\n");
    for (let i = 0; i < before.length; i += 1) {
      if (i === 3) continue;
      assert.equal(after[i], before[i], `line ${i} changed and should not have`);
    }
  });

  test("the text that was typed is what lands, character for character", () => {
    const typed = "- [ ] tabs\tand  double  spaces and [[qntm:9]] #tag 🛫 2026-08-02";
    const { commit } = editFirstTask(typed);
    assert.equal(commit.text, typed);
    assert.equal(commit.markdown.split("\n")[3], typed);
  });

  test("a line can be emptied without the file losing a line", () => {
    const { commit } = editFirstTask("");
    assert.equal(commit.markdown.split("\n").length, SOURCE.split("\n").length);
    assert.equal(commit.markdown.split("\n")[3], "");
  });

  test("text carrying a newline is refused, not split", () => {
    // An <input> cannot hold one, so this is a caller that is not the surface this was written
    // for — and letting it through would end "exactly one line replaced" as a provable property.
    assert.equal(applyEdit(SOURCE, { kind: "set-line", lineIndex: 3, text: "a\nb" }), null);
    assert.equal(applyEdit(SOURCE, { kind: "set-line", lineIndex: 3, text: "a\r" }), null);
  });

  test("an index outside the file is refused", () => {
    assert.equal(applyEdit(SOURCE, { kind: "set-line", lineIndex: 99, text: "x" }), null);
  });

  test("the checkbox affordance still writes back the same way it did", () => {
    // Two affordances, one write-back module, one whole-file unit. Stage 1's property, re-asserted
    // beside the new one because the risk of a second affordance is that it grows a second path.
    const v = view();
    const box = boxes(v.body)[0];
    let posted = null;
    globalThis.document = makeDocument();
    const body = makeBody();
    paint(body, SOURCE, new PresentationContext(), {
      markdown: md,
      focus: new FocusSurface(),
      onCheckboxToggle: (toggle) => {
        posted = toggle;
      },
    });
    const target = boxes(body)[0];
    target.checked = true;
    target.dispatch("change");
    assert.equal(posted.markdown, applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 3, checked: true }));
    assert.ok(box, "the fixture painted no checkbox to begin with");
  });
});

describe("4. the posted file is immune to a corrupted DOM", () => {
  test("wreck every other rendered element and the other lines still come from the source", () => {
    // THE DOM-INVERSION DETECTOR, for a surface that reads an element's value back. A painter
    // that rebuilt the file from the page would pass every assertion in section 3 — it would
    // reproduce the source exactly, until the DOM stopped matching it. So the DOM is made to
    // stop matching it, deliberately, before the affordance is used.
    const v = view();
    taskText(v.body).dispatch("click");
    for (const el of walk(v.body)) {
      if (el.tagName === "span") el.innerHTML = "<b>TOTALLY DIFFERENT TEXT</b>";
      if (el.tagName === "h3") el.innerHTML = "WRECKED HEADING";
      if (el.tagName === "label") el.className = "wrecked";
      if (el.tagName === "div") el.innerHTML = "WRECKED PROSE";
    }
    const line = inputs(v.body)[0];
    line.value = "- [x] Draft the launch note [[qntm:121]] #task #work ✅ 2026-07-30";
    line.dispatch("blur");

    const commit = v.commits[0];
    assert.ok(
      !commit.markdown.includes("WRECKED") && !commit.markdown.includes("TOTALLY DIFFERENT"),
      "the posted markdown carries text that only ever existed in the DOM — the app is " +
        "reconstructing markdown from the document, and it posts the WHOLE FILE",
    );
    const before = SOURCE.split("\n");
    const after = commit.markdown.split("\n");
    assert.deepEqual(
      before.map((_, i) => i).filter((i) => before[i] !== after[i]),
      [3],
      "a line nobody edited moved, which means it came from the page and not from the source",
    );
  });

  test("a corrupted input on another line cannot reach the file", () => {
    // Only the line that settles is read, and only its own value. Nothing sweeps the document
    // for editable elements — which is what a DOM-driven implementation would have to do.
    const v = view(SOURCE, new PresentationContext({ GLOBAL: { checkbox: "raw" } }));
    const editable = inputs(v.body);
    assert.equal(editable.length, 2, "both task lines should be raw under this declaration");
    editable[1].value = "- [x] A LINE NOBODY LEFT";
    editable[0].value = "- [x] the line the cursor was on";
    editable[0].dispatch("blur");

    const after = v.commits[0].markdown.split("\n");
    assert.equal(after[4], "  - [x] sub-step done [[qntm:122]] #task", "an unsettled line reached the file");
  });
});

describe("5. the cursor beats every declaration below it", () => {
  test("FOCUS outranks a GLOBAL declaration of wired", () => {
    // Without this ordering a declaration could make a line uneditable: the cursor would land on
    // it and it would go on showing the rendition. The order is owned in one tuple, and this is
    // the assertion that the painter honours it through the surface rather than only in the unit.
    const declared = new PresentationContext({
      GLOBAL: { checkbox: "wired", heading: "wired", prose: "wired" },
    });
    const v = view(SOURCE, declared);
    taskText(v.body).dispatch("click");
    assert.equal(inputs(v.body).length, 1, "a GLOBAL declaration of wired kept the cursor out");
    assert.equal(inputs(v.body)[0].value, SOURCE.split("\n")[3]);
  });

  test("the focused line resolves raw at FOCUS, and says so", () => {
    const focus = new FocusSurface();
    focus.focus(3);
    const declared = new PresentationContext({ GLOBAL: { checkbox: "wired" } });
    const on = new PresentationCascade(focus.contextFor(3, declared));
    const off = new PresentationCascade(focus.contextFor(4, declared));
    assert.deepEqual(on.resolve("checkbox"), { rendition: "raw", level: "FOCUS" });
    assert.deepEqual(off.resolve("checkbox"), { rendition: "wired", level: "GLOBAL" });
  });

  test("the focused line is raw on EVERY key, so no part of it can hide", () => {
    // Derived from RESOLUTION_KEYS rather than listed by hand: when stage 8 adds tags, links and
    // markers, a focused line that resolved its checkbox raw and its tags wired would be a line
    // you could put a cursor in and still not see.
    const focus = new FocusSurface();
    focus.focus(0);
    const cascade = new PresentationCascade(focus.contextFor(0, new PresentationContext()));
    for (const key of RESOLUTION_KEYS) {
      assert.deepEqual(cascade.resolve(key), { rendition: "raw", level: "FOCUS" });
    }
  });

  test("a context with no cursor in it is the context it was given", () => {
    const focus = new FocusSurface();
    const base = new PresentationContext({ GLOBAL: { checkbox: "raw" } });
    assert.equal(focus.contextFor(0, base).at("FOCUS"), undefined);
    assert.deepEqual(focus.contextFor(0, base).at("GLOBAL"), { checkbox: "raw" });
  });

  test("without a focus surface the painter is exactly what stage 1 shipped", () => {
    // The golden master proves this against the ORIGINAL painter; this proves the two
    // configurations of THIS painter differ only where they are supposed to.
    globalThis.document = makeDocument();
    const plain = makeBody();
    paint(plain, VIEW_MARKDOWN, new PresentationContext(), { markdown: md });
    assert.ok(!serialize(plain).includes('type="text"'), "a painter with no focus surface built an input");
    assert.ok(
      !serialize(plain).includes('listeners=["click"]'),
      "a painter with no focus surface wired a cursor affordance",
    );
  });
});
