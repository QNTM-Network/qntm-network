/**
 * VIM NORMAL MODE — the pure reducer (app/present/motions.ts), then the painter wired to it.
 *
 *   node --test tests/present-motions.test.mjs
 *
 * TWO HALVES, LIKE `present-focus.test.mjs` AND `present-cascade.test.mjs`. Section 1 drives
 * `ModeSurface` directly — no DOM, no `paint()`, exactly `clampLine`/`handleKey` in and out —
 * because the brief's whole claim is that vim's arithmetic is "a motions/mode module with no DOM,
 * no fetch, no clock, testable directly in `node --test`, exactly as `focus.ts` is pure". Section
 * 2 wires that module into `paint()` the way `app/index.html` does — apply the outcome to
 * `FocusSurface`, repaint — and asserts what a person would actually see: the selection moves, an
 * `<input>` opens on `i`/Enter and holds the line's exact source characters, and Escape returns to
 * NORMAL without posting.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, makeEvent, walk } from "./fixtures/dom-stub.mjs";
import {
  paint,
  clampLine,
  ModeSurface,
  FocusSurface,
  PresentationContext,
} from "../dist/present.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE PURE REDUCER — no DOM anywhere in this section
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("1. clampLine — the arithmetic every motion shares", () => {
  test("stays inside [0, lastIndex]", () => {
    assert.equal(clampLine(5, 10), 5);
    assert.equal(clampLine(-3, 10), 0);
    assert.equal(clampLine(15, 10), 10);
    assert.equal(clampLine(0, 10), 0);
    assert.equal(clampLine(10, 10), 10);
  });

  test("does not wrap — vim's j/k never carry the cursor past either end", () => {
    // A wrapping implementation would send -1 to `lastIndex` (mod) or `lastIndex + 1` to `0`.
    // Neither is what clampLine does.
    assert.notEqual(clampLine(-1, 10), 10);
    assert.notEqual(clampLine(11, 10), 0);
  });

  test("an empty source clamps to 0, not to a negative index", () => {
    assert.equal(clampLine(0, -1), 0);
    assert.equal(clampLine(5, -1), 0);
  });
});

describe("2. ModeSurface starts NORMAL and j/k move by the pending count", () => {
  test("starts in NORMAL", () => {
    assert.equal(new ModeSurface().mode, "NORMAL");
  });

  test("j moves down by one with no count", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("j", 3, 10);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 4 });
  });

  test("k moves up by one with no count", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("k", 3, 10);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 2 });
  });

  test("j clamps at the last line and does not wrap to the first", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("j", 10, 10);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 10 });
  });

  test("k clamps at the first line and does not wrap to the last", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("k", 0, 10);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 0 });
  });

  test("a run of j at the top of the file never goes negative", () => {
    const mode = new ModeSurface();
    let current = 0;
    for (let i = 0; i < 3; i += 1) {
      const outcome = mode.handleKey("k", current, 10);
      current = outcome.effect.lineIndex;
    }
    assert.equal(current, 0);
  });
});

describe("3. a count prefix applies once and then clears", () => {
  test("12j moves twelve lines and clears the count", () => {
    const mode = new ModeSurface();
    for (const digit of "12") {
      const outcome = mode.handleKey(digit, 0, 100);
      assert.equal(outcome.handled, true, `digit ${digit} was not consumed into the count`);
      assert.deepEqual(outcome.effect, { kind: "none" }, `digit ${digit} moved something`);
    }
    const moved = mode.handleKey("j", 5, 100);
    assert.deepEqual(moved.effect, { kind: "move", lineIndex: 17 });

    // THE CLEAR. The next j with no digits in front of it moves by one, not by twelve again —
    // proving the count was consumed rather than remembered.
    const next = mode.handleKey("j", 17, 100);
    assert.deepEqual(next.effect, { kind: "move", lineIndex: 18 });
  });

  test("5k moves five lines up", () => {
    const mode = new ModeSurface();
    mode.handleKey("5", 0, 100);
    const outcome = mode.handleKey("k", 20, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 15 });
  });

  test("a non-digit that is itself unbound still clears a pending count", () => {
    const mode = new ModeSurface();
    mode.handleKey("9", 0, 100);
    const stray = mode.handleKey("x", 0, 100);
    assert.equal(stray.handled, false, "an unbound key was reported as handled");
    const moved = mode.handleKey("j", 4, 100);
    assert.deepEqual(moved.effect, { kind: "move", lineIndex: 5 }, "the stale count of 9 survived an unbound key");
  });

  test("bare 0 with no pending count is left unbound, not guessed at as a motion", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("0", 7, 100);
    assert.equal(outcome.handled, false);
    assert.deepEqual(outcome.effect, { kind: "none" });
  });

  test("0 continues a count that is already pending — '10j' is ten, not one then zero", () => {
    const mode = new ModeSurface();
    mode.handleKey("1", 0, 100);
    const zero = mode.handleKey("0", 0, 100);
    assert.equal(zero.handled, true, "0 did not continue the pending count");
    const outcome = mode.handleKey("j", 0, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 10 });
  });
});

describe("4. gg and G", () => {
  test("gg goes to the first line", () => {
    const mode = new ModeSurface();
    mode.handleKey("g", 50, 100);
    const outcome = mode.handleKey("g", 50, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 0 });
  });

  test("a lone g that is not followed by a second g is abandoned, and the breaking key still fires", () => {
    const mode = new ModeSurface();
    const first = mode.handleKey("g", 5, 100);
    assert.equal(first.handled, false, "a lone g should not itself be reported as a binding");
    const outcome = mode.handleKey("j", 5, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 6 }, "g then j should still move down by one");
  });

  test("bare G goes to the last line", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("G", 3, 40);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 40 });
  });

  test("{count}G goes to that line, 1-indexed", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 40);
    const outcome = mode.handleKey("G", 0, 40);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 2 });
  });

  test("{count}G clamps past the end of a short file", () => {
    const mode = new ModeSurface();
    mode.handleKey("9", 0, 3);
    mode.handleKey("9", 0, 3);
    const outcome = mode.handleKey("G", 0, 3);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 3 });
  });
});

describe("5. i and Enter start INSERT; Escape's job belongs to the input, not to this module", () => {
  test("i enters INSERT", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("i", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "enter-insert" });
    assert.equal(mode.mode, "INSERT");
  });

  test("Enter enters INSERT the same way i does", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("Enter", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "enter-insert" });
    assert.equal(mode.mode, "INSERT");
  });

  test("a is left unbound — see motions.ts for why end-of-line caret was skipped rather than faked", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("a", 4, 100);
    assert.equal(outcome.handled, false);
    assert.equal(mode.mode, "NORMAL");
  });

  test("handleKey is inert while INSERT — the caller's own <input> owns keys once one is open", () => {
    const mode = new ModeSurface();
    mode.enterInsert();
    const outcome = mode.handleKey("j", 4, 100);
    assert.equal(outcome.handled, false);
    assert.deepEqual(outcome.effect, { kind: "none" });
    assert.equal(mode.mode, "INSERT", "handleKey must not itself leave INSERT");
  });

  test("enterNormal clears a count and a pending gg that INSERT interrupted", () => {
    const mode = new ModeSurface();
    mode.handleKey("9", 0, 100);
    mode.handleKey("g", 0, 100);
    mode.enterInsert();
    mode.enterNormal();
    // If the stale "9" or the pending "g" had survived, this "j" would move by nine or fire gg.
    const outcome = mode.handleKey("j", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 5 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. WIRED TO THE PAINTER — the thin DOM layer app/index.html adds, reproduced here so the
//    reducer's outcome can be checked against what actually gets drawn.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const md = new MarkdownIt("commonmark").enable("table");

const SOURCE = [
  "# This Week",
  "- [ ] first task [[qntm:1]] #task",
  "- [ ] second task [[qntm:2]] #task",
  "- [ ] third task [[qntm:3]] #task",
].join("\n");

/** Paint with both surfaces wired, the way app/index.html does once vim is live. */
function view(source = SOURCE) {
  globalThis.document = makeDocument();
  const body = makeBody();
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const commits = [];
  const deps = { markdown: md, focus, mode, onLineCommit: (c) => commits.push(c) };
  const repaint = () => paint(body, source, new PresentationContext(), deps);
  repaint();
  return { body, focus, mode, commits, repaint, source };
}

/** The thin wiring itself — exactly what the keydown handler in app/index.html does. */
function press(v, key) {
  const lastIndex = v.source.split("\n").length - 1;
  const current = v.focus.lineIndex ?? 0;
  const outcome = v.mode.handleKey(key, current, lastIndex);
  if (outcome.effect.kind === "move") {
    v.focus.focus(outcome.effect.lineIndex);
  }
  if (outcome.handled) {
    v.repaint();
  }
  return outcome;
}

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");
const selectedRows = (body) =>
  walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("vim-selected"));

describe("6. NORMAL: no <input> is open, and the selection is a class, not a caret", () => {
  test("a freshly painted view with vim wired opens nothing", () => {
    const v = view();
    assert.equal(inputs(v.body).length, 0, "NORMAL mode painted an editable line unasked");
  });

  test("selecting a line (mouse-equivalent: FocusSurface.focus) marks it, and opens no input", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    assert.equal(inputs(v.body).length, 0, "selecting a line in NORMAL opened an <input>");
    assert.equal(selectedRows(v.body).length, 1);
  });

  test("j moves the selection mark down by one line", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "j");
    assert.equal(v.focus.lineIndex, 2);
    assert.equal(inputs(v.body).length, 0);
    const rows = selectedRows(v.body);
    assert.equal(rows.length, 1);
  });

  test("k clamps at the first line", () => {
    const v = view();
    v.focus.focus(0);
    v.repaint();
    press(v, "k");
    assert.equal(v.focus.lineIndex, 0);
  });

  test("j clamps at the last line", () => {
    const v = view();
    const lastIndex = SOURCE.split("\n").length - 1;
    v.focus.focus(lastIndex);
    v.repaint();
    press(v, "j");
    assert.equal(v.focus.lineIndex, lastIndex);
  });

  test("gg then G walk to the first and last line", () => {
    const v = view();
    v.focus.focus(2);
    v.repaint();
    press(v, "g");
    press(v, "g");
    assert.equal(v.focus.lineIndex, 0);
    press(v, "G");
    assert.equal(v.focus.lineIndex, SOURCE.split("\n").length - 1);
  });

  test("an unbound key does nothing — no repaint, no selection change", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    const before = selectedRows(v.body)[0];
    const outcome = press(v, "z");
    assert.equal(outcome.handled, false);
    assert.equal(v.focus.lineIndex, 1);
    // The row was never rebuilt for this keystroke — same object, not a repainted lookalike.
    assert.equal(selectedRows(v.body)[0], before);
  });
});

describe("7. i / Enter open INSERT, and the cascade still shows the source characters", () => {
  test("i opens an <input> on the selected line holding its exact source", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "i");
    assert.equal(v.mode.mode, "INSERT");
    const line = inputs(v.body)[0];
    assert.ok(line, "i did not open an editable line");
    assert.equal(line.value, "- [ ] first task [[qntm:1]] #task");
    assert.equal(line.focused, true);
  });

  test("Enter opens INSERT the same way i does", () => {
    const v = view();
    v.focus.focus(2);
    v.repaint();
    press(v, "Enter");
    assert.equal(v.mode.mode, "INSERT");
    assert.equal(inputs(v.body)[0].value, "- [ ] second task [[qntm:2]] #task");
  });

  test("while INSERT is open, j does not move the selection — the <input> owns the keyboard now", () => {
    const v = view();
    v.focus.focus(0);
    v.repaint();
    press(v, "i");
    const outcome = press(v, "j");
    assert.equal(outcome.handled, false);
    assert.equal(v.focus.lineIndex, 0);
    assert.equal(inputs(v.body).length, 1, "the input closed on an unrelated keystroke");
  });
});

describe("8. Escape returns to NORMAL without posting, and keeps the selection", () => {
  test("Escape on the open input posts nothing and drops what was typed", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "i");
    const line = inputs(v.body)[0];
    line.value = "- [x] something else entirely";
    line.dispatch("keydown", makeEvent({ key: "Escape" }));

    assert.deepEqual(v.commits, [], "Escape posted an edit");
    assert.equal(v.mode.mode, "NORMAL", "Escape did not return to NORMAL");
  });

  test("the selection survives Escape — vim always has a cursor on some line", () => {
    const v = view();
    v.focus.focus(2);
    v.repaint();
    press(v, "i");
    inputs(v.body)[0].dispatch("keydown", makeEvent({ key: "Escape" }));

    assert.equal(v.focus.lineIndex, 2, "Escape cleared the selection instead of leaving INSERT");
    assert.equal(inputs(v.body).length, 0, "an <input> is still open after Escape");
    assert.equal(selectedRows(v.body).length, 1, "the selection mark did not come back after Escape");
  });

  test("after Escape, j moves on from the line that was being edited, not from nowhere", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "i");
    inputs(v.body)[0].dispatch("keydown", makeEvent({ key: "Escape" }));
    press(v, "j");
    assert.equal(v.focus.lineIndex, 2);
  });
});

describe("9. without a ModeSurface, focus behaves exactly as it did before vim existed", () => {
  test("a focused line is still always an editable input — no ModeSurface, no NORMAL/INSERT gate", () => {
    globalThis.document = makeDocument();
    const body = makeBody();
    const focus = new FocusSurface();
    focus.focus(1);
    paint(body, SOURCE, new PresentationContext(), { markdown: md, focus });
    assert.equal(inputs(body).length, 1, "click-to-edit regressed for callers with no ModeSurface");
  });
});
