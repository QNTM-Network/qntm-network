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
  applyEdit,
  boundaryLine,
  classifyLine,
  clampColumn,
  clampLine,
  indentedLine,
  INDENT_UNIT,
  openLine,
  wordCaret,
  columnFor,
  DraftSurface,
  FocusSurface,
  ModeSurface,
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

// ArrowDown/ArrowUp — the operator's own gesture ("selecting up and down"), added alongside j/k
// rather than instead of them, the same second-name-one-motion shape `app/shell/drawer.ts`'s own
// `drawerKey` already commits to for the picker's row list. Before this, `handleKey("ArrowDown", …)`
// fell to the `default` case and reported `handled: false` — proven live: pressed in the operator's
// real "Admin" view, `j` moved the selection and `ArrowDown` did nothing at all. This section proves
// the SAME arithmetic j/k already have (count composition, clamping) now also answers to the arrow
// names, not a second, parallel implementation of it.
describe("2b. ArrowDown/ArrowUp are the same motion as j/k, under a second name", () => {
  test("ArrowDown moves down by one with no count, identically to j", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("ArrowDown", 3, 10);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 4 });
  });

  test("ArrowUp moves up by one with no count, identically to k", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("ArrowUp", 3, 10);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 2 });
  });

  test("ArrowDown clamps at the last line and does not wrap to the first", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("ArrowDown", 10, 10);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 10 });
  });

  test("ArrowUp clamps at the first line and does not wrap to the last", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("ArrowUp", 0, 10);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 0 });
  });

  test("a pending count composes with ArrowDown exactly as it does with j", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey("ArrowDown", 5, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 8 });
  });

  test("a pending count composes with ArrowUp exactly as it does with k", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey("ArrowUp", 20, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 17 });
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
    // "q" rather than "x": slice 2 binds "x" to toggle-done, so it is no longer an example of an
    // unbound key. "q" is not bound to anything in NORMAL mode.
    const stray = mode.handleKey("q", 0, 100);
    assert.equal(stray.handled, false, "an unbound key was reported as handled");
    const moved = mode.handleKey("j", 4, 100);
    assert.deepEqual(moved.effect, { kind: "move", lineIndex: 5 }, "the stale count of 9 survived an unbound key");
  });

  test("bare 0 with no pending count is the column motion, not a count digit", () => {
    // IT USED TO BE LEFT UNBOUND, and that was honest while the cursor had no column for it to send
    // to zero. It has one now, so `0` means what vim means by it. The ORDER is what keeps this and
    // the test below apart: a pending count claims the digit first.
    const mode = new ModeSurface();
    const outcome = mode.handleKey("0", 7, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "column", to: "start" });
    assert.equal(mode.mode, "NORMAL", "a column motion changed the mode");
  });

  test("$ is the other end of the same motion, and needs no count", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("$", 7, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "column", to: "end" });
    assert.equal(mode.mode, "NORMAL");
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
  test("i enters INSERT at the cursor's own column", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("i", 4, 100, 11);
    assert.equal(outcome.handled, true);
    // AT THE CURSOR'S OWN COLUMN — the fourth argument, which is `FocusSurface.column`. It used to
    // be `{ kind: "enter-insert" }` with no caret at all, and the browser decided where the caret
    // landed after `value =` then `focus()`; nothing decided it, so nothing could be asserted.
    // THE INTENT, NOT THE NUMBER (2026-08-12). motions.ts imports nothing, so it cannot see the
    // line a column indexes; it reports what `i` MEANT and column.ts measures it. The column that
    // used to be asserted here is asserted in the same breath, one module over, so the claim is
    // whole rather than halved.
    assert.deepEqual(outcome.effect, { kind: "enter-insert", caret: "insert" });
    assert.equal(mode.mode, "INSERT");
    assert.equal(mode.takeCaretHint(), "insert");
    assert.equal(columnFor({ kind: "insert" }, "a line with plenty of characters", 11), 11);
  });

  test("i reports the same intent whatever the cursor's column — the column is not this module's to know", () => {
    // THE OLD NAME OF THIS TEST WAS "i with no column argument opens at column 0". There is no
    // column argument any more: `handleKey` never read it once the arithmetic moved to column.ts,
    // so it was deleted. What survives is the stronger claim — this module's answer to `i` does not
    // depend on a column at all, which is what makes it safe for it to import nothing.
    const mode = new ModeSurface();
    assert.deepEqual(mode.handleKey("i", 4, 100).effect, { kind: "enter-insert", caret: "insert" });
    assert.equal(columnFor({ kind: "insert" }, "abcdefghij", 0), 0);
  });

  test("Enter enters INSERT the same way i does", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("Enter", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "enter-insert", caret: "insert" });
    assert.equal(mode.mode, "INSERT");
  });

  test("a enters INSERT one past the cursor — i opens AT the column, a opens after it", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("a", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "enter-insert", caret: "append" });
    assert.equal(mode.mode, "INSERT");
    assert.equal(mode.takeCaretHint(), "append");
    // ONE PAST THE CURSOR, asserted where the arithmetic now lives.
    assert.equal(columnFor({ kind: "append" }, "a line with plenty of characters", 11), 12);
  });

  test("takeCaretHint is an INTENT for i/Enter/a, and undefined for a click-equivalent enterInsert()", () => {
    // IT WAS A NUMBER UNTIL 2026-08-12 and is now "insert"/"append". The painter no longer reads a
    // position out of it at all — it reads PERMISSION, and takes the position from FocusSurface,
    // which the resolver wrote. That is what stopped `a` placing a caret the cursor surface never
    // learned about.
    const mode = new ModeSurface();
    mode.handleKey("i", 4, 100);
    assert.equal(mode.takeCaretHint(), "insert");

    const mode2 = new ModeSurface();
    mode2.handleKey("Enter", 4, 100);
    assert.equal(mode2.takeCaretHint(), "insert");

    // THE MOUSE CLICK IS THE ONE PATH THAT STILL LEAVES IT UNSET, and it has to: a click puts the
    // caret where the person clicked, and a hint would overrule that.
    const mode3 = new ModeSurface();
    mode3.enterInsert();
    assert.equal(mode3.takeCaretHint(), undefined);
  });

  test("takeCaretHint is consumed once — a second read after the first does not see it again", () => {
    const mode = new ModeSurface();
    mode.handleKey("a", 4, 100);
    assert.equal(mode.takeCaretHint(), "append");
    assert.equal(mode.takeCaretHint(), undefined, "the hint should have been cleared by the first read");
  });

  test("a discards a pending count rather than refusing — entering INSERT is the same act either way", () => {
    const mode = new ModeSurface();
    mode.handleKey("5", 0, 100);
    const outcome = mode.handleKey("a", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "enter-insert", caret: "append" });
    assert.equal(mode.mode, "INSERT");
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

describe("6. o / O ask for a new line — direction only, this module does not open one", () => {
  test("o asks to open below", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("o", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "open", direction: "below" });
    assert.equal(mode.mode, "NORMAL", "o does not itself enter INSERT — opening can be refused");
  });

  test("O asks to open above", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("O", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "open", direction: "above" });
  });

  test("a pending count in front of o is refused, not silently discarded", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey("o", 4, 100);
    assert.equal(outcome.handled, true, "o should still be consumed so the browser default is suppressed");
    assert.deepEqual(outcome.effect, { kind: "none" }, "3o should not silently open exactly one line");
  });

  test("a pending count in front of O is refused the same way", () => {
    const mode = new ModeSurface();
    mode.handleKey("2", 0, 100);
    const outcome = mode.handleKey("O", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "none" });
  });

  test("the count is cleared either way — the next unprefixed motion is not still counted", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    mode.handleKey("o", 4, 100);
    const outcome = mode.handleKey("j", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 5 }, "the stale count of 3 survived o");
  });
});

describe("7. x asks to toggle done — whether the line HAS a checkbox is the caller's to decide", () => {
  test("x asks to toggle done", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("x", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "toggle-done" });
    assert.equal(mode.mode, "NORMAL", "toggling done never opens an <input>");
  });

  test("a pending count in front of x is refused, not toggled once anyway", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey("x", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "none" });
  });
});

describe("8. { and } — direction and count only; boundary.ts decides which line", () => {
  test("} with no count asks to move forward by one boundary", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("}", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "boundary", direction: "next", count: 1 });
  });

  test("{ with no count asks to move backward by one boundary", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("{", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "boundary", direction: "prev", count: 1 });
  });

  test("3} composes the count exactly like every other motion", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey("}", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "boundary", direction: "next", count: 3 });
  });

  test("the count clears after } fires, same as after any other motion", () => {
    const mode = new ModeSurface();
    mode.handleKey("5", 0, 100);
    mode.handleKey("}", 4, 100);
    const outcome = mode.handleKey("j", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 5 });
  });
});

describe("8a. > and < — direction and count only; indent.ts decides the new text", () => {
  test("> with no count asks to indent by one unit", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey(">", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "indent", direction: "in", count: 1 });
  });

  test("< with no count asks to outdent by one unit", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("<", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "indent", direction: "out", count: 1 });
  });

  test("3> composes the count exactly like every other motion", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey(">", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "indent", direction: "in", count: 3 });
  });

  test("2< composes the same way", () => {
    const mode = new ModeSurface();
    mode.handleKey("2", 0, 100);
    const outcome = mode.handleKey("<", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "indent", direction: "out", count: 2 });
  });

  test("the count clears after > fires, same as after any other motion", () => {
    const mode = new ModeSurface();
    mode.handleKey("5", 0, 100);
    mode.handleKey(">", 4, 100);
    const outcome = mode.handleKey("j", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 5 });
  });
});

describe("8b. boundaryLine (app/present/boundary.ts) — pure, no DOM, the arithmetic { and } need", () => {
  const OUTLINE = [
    "# Top",
    "- [ ] a task with no heading nearby",
    "## Overdue",
    "- [ ] one",
    "- [ ] two",
    "## Due This Week",
    "- [ ] three",
    "prose with no heading after it",
  ];

  test("} from line 0 lands on the next heading", () => {
    assert.equal(boundaryLine(OUTLINE, 0, "next", 1), 2);
  });

  test("} again from a heading lands on the NEXT one, not the same one", () => {
    assert.equal(boundaryLine(OUTLINE, 2, "next", 1), 5);
  });

  test("} past the last heading lands on the last line of the file", () => {
    assert.equal(boundaryLine(OUTLINE, 5, "next", 1), OUTLINE.length - 1);
  });

  test("{ from the last line lands on the nearest heading above it", () => {
    assert.equal(boundaryLine(OUTLINE, OUTLINE.length - 1, "prev", 1), 5);
  });

  test("{ before the first heading lands on line 0", () => {
    assert.equal(boundaryLine(OUTLINE, 1, "prev", 1), 0);
  });

  test("2} composes — two heading-jumps forward from the top", () => {
    assert.equal(boundaryLine(OUTLINE, 0, "next", 2), 5);
  });

  test("a count that outruns the remaining headings lands on the file's own end, not the last one found", () => {
    assert.equal(boundaryLine(OUTLINE, 0, "next", 10), OUTLINE.length - 1);
  });

  test("a view with no headings at all: } goes to the last line and { goes to the first", () => {
    const NO_HEADINGS = ["- [ ] a", "- [ ] b", "- [ ] c"];
    assert.equal(boundaryLine(NO_HEADINGS, 0, "next", 1), 2);
    assert.equal(boundaryLine(NO_HEADINGS, 2, "prev", 1), 0);
  });
});

describe("8c. indentedLine (app/present/indent.ts) — pure, no DOM, the arithmetic > and < need", () => {
  test("the unit is four spaces, taken from the engine — renderer.py:947-950", () => {
    assert.equal(INDENT_UNIT, 4);
  });

  test("> on a line with no indent emits exactly four spaces", () => {
    const result = indentedLine("- [ ] a task", "in", 1);
    assert.equal(result, "    - [ ] a task");
    assert.equal(result.match(/^ */)[0].length, INDENT_UNIT);
  });

  test("< at zero indent is a no-op — the line comes back unchanged, not an error, not a wrap", () => {
    const line = "- [ ] a task";
    assert.equal(indentedLine(line, "out", 1), line);
  });

  test("> then < returns the line to byte-identical original, from zero", () => {
    const original = "- [ ] a task";
    const indented = indentedLine(original, "in", 1);
    const restored = indentedLine(indented, "out", 1);
    assert.equal(restored, original);
  });

  test("> then < returns the line to byte-identical original, from an already-indented line", () => {
    const original = "    - [ ] a nested task";
    const indented = indentedLine(original, "in", 1);
    assert.equal(indented, "        - [ ] a nested task");
    const restored = indentedLine(indented, "out", 1);
    assert.equal(restored, original);
  });

  test("a count applies — 3> indents three units in one call", () => {
    const result = indentedLine("- [ ] a task", "in", 3);
    assert.equal(result, "            - [ ] a task"); // 12 spaces
    assert.equal(result.match(/^ */)[0].length, 3 * INDENT_UNIT);
  });

  test("a count applies to outdent too, floored at zero", () => {
    const twelve = "            - [ ] a task";
    assert.equal(indentedLine(twelve, "out", 2), "    - [ ] a task");
    assert.equal(indentedLine(twelve, "out", 10), "- [ ] a task");
  });

  test("the emitted indent is always a whole multiple of the unit — a line starting at an ODD number of spaces rounds up on indent", () => {
    // Three spaces is not a multiple of four. The decision: > rounds UP to the next multiple
    // rather than adding four to whatever was there (which would leave seven — not a multiple).
    const odd = "   - [ ] odd indent";
    const result = indentedLine(odd, "in", 1);
    assert.equal(result, "    - [ ] odd indent"); // four, not seven
    assert.equal(result.match(/^ */)[0].length % INDENT_UNIT, 0);
  });

  test("the odd-indent decision means > then < does NOT round-trip — outdent removes a further whole unit from the rounded value, not the original three", () => {
    const odd = "   - [ ] odd indent";
    const indented = indentedLine(odd, "in", 1); // -> 4 spaces
    const restored = indentedLine(indented, "out", 1); // -> 0, not back to 3
    assert.equal(restored, "- [ ] odd indent");
    assert.notEqual(restored, odd, "the odd remainder was silently preserved instead of rounded away");
  });

  test("outdenting an odd, non-multiple indent rounds DOWN to the nearest multiple below it", () => {
    const odd = "     - [ ] five spaces"; // 5 spaces — not a multiple of 4
    assert.equal(indentedLine(odd, "out", 1), "    - [ ] five spaces"); // down to 4, the nearest multiple below 5
  });

  test("a leading tab counts toward the length being rounded, and the output is always pure spaces", () => {
    const tabbed = "\t- [ ] tab indent";
    const result = indentedLine(tabbed, "in", 1);
    assert.ok(!result.includes("\t"), "a tab survived into the emitted indent");
    assert.equal(result, "    - [ ] tab indent");
  });

  test("a heading line refuses — indenting it would stop it being a heading, on both ends", () => {
    const heading = "## Overdue";
    assert.equal(indentedLine(heading, "in", 1), heading);
    assert.equal(indentedLine(heading, "out", 1), heading);
  });

  test("a blank line refuses — there is no content to reparent", () => {
    assert.equal(indentedLine("", "in", 1), "");
    assert.equal(indentedLine("   ", "in", 1), "   ");
  });

  test("a plain prose (non-checkbox, non-bulleted) node line is indented the same way a checkbox line is", () => {
    const prose = "some continuation text";
    assert.equal(indentedLine(prose, "in", 1), "    some continuation text");
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

/** Paint with every surface wired, the way app/index.html does once vim is live. */
function view(source = SOURCE) {
  globalThis.document = makeDocument();
  const body = makeBody();
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const draft = new DraftSurface();
  const commits = [];
  const declined = [];
  const deps = {
    markdown: md,
    focus,
    mode,
    draft,
    onLineCommit: (c) => commits.push(c),
    onNewLineDeclined: (lineIndex) => declined.push(lineIndex),
  };
  const repaint = () => paint(body, source, new PresentationContext(), deps);
  repaint();
  return { body, focus, mode, draft, commits, declined, repaint, source };
}

/**
 * The thin wiring itself — exactly what the keydown handler in app/index.html does, including the
 * slice-2 branches (`open`, `toggle-done`, `boundary`). `toggle-done` does not go through
 * `deps.onLineCommit` — neither does the real page, which builds the commit itself and hands it to
 * `commitLine` directly — so it is recorded on `v.commits` the same shape that callback already
 * uses, for one assertion surface regardless of which key produced the commit.
 */
function press(v, key) {
  const lastIndex = v.source.split("\n").length - 1;
  const current = v.focus.lineIndex ?? 0;
  const outcome = v.mode.handleKey(key, current, lastIndex, v.focus.column);
  if (!outcome.handled) {
    return outcome;
  }
  const effect = outcome.effect;
  if (effect.kind === "move") {
    v.focus.focus(effect.lineIndex);
    v.repaint();
  } else if (effect.kind === "boundary") {
    v.focus.focus(boundaryLine(v.source.split("\n"), current, effect.direction, effect.count));
    v.repaint();
  } else if (effect.kind === "open") {
    const targetIndex = effect.direction === "below" ? current + 1 : current;
    const opened = openLine(v.source, targetIndex, v.draft, (lineIndex) => v.declined.push(lineIndex));
    if (opened) {
      // Same sequence as app/index.html: blur before enterInsert, so the line o/O was pressed on
      // does not ALSO become an <input> once mode flips (paint.ts's raw-on-focus gate).
      v.focus.blur();
      v.mode.enterInsert();
    }
    v.repaint();
  } else if (effect.kind === "toggle-done") {
    const line = v.source.split("\n")[current] ?? "";
    const shape = classifyLine(line);
    if (shape.kind === "checkbox") {
      const markdown = applyEdit(v.source, { kind: "set-checkbox", lineIndex: current, checked: !shape.done });
      if (markdown !== null) {
        v.commits.push({ lineIndex: current, text: line, markdown });
      }
    }
  } else if (effect.kind === "indent") {
    // `>`/`<` — the same shape as app/index.html's own branch: `indentedLine` decides the text,
    // `applyEdit`'s own no-op refusal (an unchanged line) decides whether anything is posted.
    const line = v.source.split("\n")[current] ?? "";
    const text = indentedLine(line, effect.direction, effect.count);
    const markdown = applyEdit(v.source, { kind: "set-line", lineIndex: current, text });
    if (markdown !== null) {
      v.commits.push({ lineIndex: current, text, markdown });
    }
  } else if (effect.kind === "word") {
    // `w`/`b`/`e` — the same shape as app/index.html's own branch: `wordCaret` decides the column
    // from the cursor's CURRENT one (or refuses with `null`), and the cursor moves along the line
    // it is already on. Nothing enters INSERT; that was the defect.
    const line = v.source.split("\n")[current] ?? "";
    const at = wordCaret(line, effect.motion, effect.count, v.focus.column);
    if (at !== null) {
      v.focus.moveColumn(at, line);
      v.repaint();
    }
  } else if (effect.kind === "column") {
    // `0`/`$` — the line's own ends, clamped by `moveColumn` onto a character that exists.
    const line = v.source.split("\n")[current] ?? "";
    v.focus.moveColumn(effect.to === "start" ? 0 : line.length, line);
    v.repaint();
  } else {
    v.repaint();
  }
  return outcome;
}

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");
const selectedRows = (body) =>
  walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("vim-selected"));

describe("9. NORMAL: no <input> is open, and the selection is a class, not a caret", () => {
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

describe("10. i / Enter open INSERT, and the cascade still shows the source characters", () => {
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

describe("11. Escape returns to NORMAL without posting, and keeps the selection", () => {
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

describe("12. without a ModeSurface, focus behaves exactly as it did before vim existed", () => {
  test("a focused line is still always an editable input — no ModeSurface, no NORMAL/INSERT gate", () => {
    globalThis.document = makeDocument();
    const body = makeBody();
    const focus = new FocusSurface();
    focus.focus(1);
    paint(body, SOURCE, new PresentationContext(), { markdown: md, focus });
    assert.equal(inputs(body).length, 1, "click-to-edit regressed for callers with no ModeSurface");
  });
});

describe("13. a opens INSERT one past the cursor; i opens AT it", () => {
  test("a at column 0 lands the caret at column 1 — 'after the character under the cursor'", () => {
    const v = view();
    v.focus.focus(1, v.source); // "- [ ] first task [[qntm:1]] #task", column 0
    v.repaint();
    press(v, "a");
    assert.equal(v.mode.mode, "INSERT");
    const line = inputs(v.body)[0];
    assert.ok(line, "a did not open an editable line");
    const text = SOURCE.split("\n")[1];
    assert.equal(line.value, text, "a changed the line's characters");
    assert.equal(line.selectionStart, 1, "a did not land one past the cursor's column");
    assert.equal(line.selectionEnd, 1, "the caret was not collapsed");
  });

  test("a on the line's LAST character lands at its END — the old behaviour, as a boundary case", () => {
    // `a` used to mean "the end of the line" unconditionally, because there was no column for it to
    // be one past. That reading is not KEPT here; it FALLS OUT of `column + 1` clamped by the
    // painter against the line it is opening, which is the only arithmetic there now is.
    const v = view();
    v.focus.focus(1, v.source);
    v.repaint();
    press(v, "$");
    press(v, "a");
    const text = SOURCE.split("\n")[1];
    assert.equal(inputs(v.body)[0].selectionStart, text.length);
  });

  test("i opens AT the cursor's column, which is zero on a line just landed on", () => {
    const v = view();
    v.focus.focus(1, v.source);
    v.repaint();
    press(v, "i");
    assert.equal(inputs(v.body)[0].selectionStart, 0, "i did not open at the cursor's own column");
  });

  test("a discards a pending count and is still one past the cursor", () => {
    const v = view();
    v.focus.focus(0, v.source);
    v.repaint();
    press(v, "9");
    press(v, "a");
    assert.equal(v.mode.mode, "INSERT");
    assert.equal(inputs(v.body)[0].selectionStart, 1);
  });
});

describe("14. o / O open a new line below/above and enter INSERT on it", () => {
  test("o opens a draft below the selected line, and enters INSERT", () => {
    const v = view();
    v.focus.focus(1); // "- [ ] first task…"
    v.repaint();
    press(v, "o");
    assert.equal(v.mode.mode, "INSERT");
    assert.equal(v.draft.draft?.lineIndex, 2, "o did not open below the selected line");
    assert.equal(inputs(v.body).length, 1, "more than one row is editable at once");
    assert.equal(inputs(v.body)[0].focused, true, "the cursor did not land in the new line");
  });

  test("O opens a draft AT the selected line, pushing it down", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "O");
    assert.equal(v.draft.draft?.lineIndex, 1, "O did not open above the selected line");
    assert.equal(inputs(v.body).length, 1);
  });

  test("the seed comes from the SAME chrome Enter's own openLineAt would resolve", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "o");
    // The task above is unindented, so the new line's seed is a bare unchecked checkbox.
    assert.equal(v.draft.draft.seed, "- [ ] ");
  });

  test("o on a view with no evidence of a node line declines, exactly as Enter's openLineAt does", () => {
    const v = view("prose with no bullet and no heading at all");
    v.focus.focus(0);
    v.repaint();
    press(v, "o");
    assert.equal(v.mode.mode, "NORMAL", "a declined open must not enter INSERT");
    assert.equal(v.draft.draft, null, "a declined open must not leave a draft behind");
    assert.deepEqual(v.declined, [1], "the decline was not reported");
    assert.equal(inputs(v.body).length, 0);
  });

  test("a count in front of o refuses the whole gesture — no draft, no INSERT", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "3");
    press(v, "o");
    assert.equal(v.mode.mode, "NORMAL");
    assert.equal(v.draft.draft, null);
  });

  test("committing the draft returns vim to NORMAL, selected on the line just made", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "o");
    const draft = inputs(v.body)[0];
    draft.value = "- [ ] a brand new task";
    draft.dispatch("blur");
    assert.equal(v.mode.mode, "NORMAL", "settling the draft left mode stuck in INSERT");
    assert.equal(v.focus.lineIndex, 2, "the cursor did not land on the newly made line");
    assert.equal(v.commits.length, 1);
    assert.equal(v.commits[0].markdown.split("\n")[2], "- [ ] a brand new task");
  });

  test("abandoning the draft (Escape) also returns vim to NORMAL with a real line selected", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "o");
    const draft = inputs(v.body)[0];
    draft.dispatch("keydown", makeEvent({ key: "Escape" }));
    assert.equal(v.mode.mode, "NORMAL");
    assert.equal(v.focus.lineIndex, 2, "focus should land where the abandoned line would have been");
    assert.deepEqual(v.commits, [], "an abandoned draft must not post anything");
  });
});

describe("15. x toggles done on the selected line, through applyEdit's own set-checkbox case", () => {
  test("x on an unchecked task checks it", () => {
    const v = view();
    v.focus.focus(1); // "- [ ] first task [[qntm:1]] #task"
    v.repaint();
    press(v, "x");
    assert.equal(v.commits.length, 1);
    assert.equal(v.commits[0].markdown.split("\n")[1], "- [x] first task [[qntm:1]] #task");
    assert.equal(v.mode.mode, "NORMAL", "x must not open an <input>");
  });

  test("x on a checked task unchecks it", () => {
    const checked = SOURCE.split("\n");
    checked[1] = "- [x] first task [[qntm:1]] #task";
    const v = view(checked.join("\n"));
    v.focus.focus(1);
    v.repaint();
    press(v, "x");
    assert.equal(v.commits[0].markdown.split("\n")[1], "- [ ] first task [[qntm:1]] #task");
  });

  test("x on the heading does nothing — no checkbox, no commit", () => {
    const v = view();
    v.focus.focus(0); // "# This Week"
    v.repaint();
    press(v, "x");
    assert.deepEqual(v.commits, [], "x acted on a line with no checkbox");
  });

  test("a pending count in front of x does nothing at all", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "3");
    press(v, "x");
    assert.deepEqual(v.commits, []);
  });
});

describe("16. { and } through the painter — boundaryLine drives the same focus.focus/repaint move does", () => {
  const OUTLINED = [
    "# This Week",
    "- [ ] a task under no sub-heading",
    "## Overdue",
    "- [ ] one",
    "- [ ] two",
    "## Due This Week",
    "- [ ] three",
  ].join("\n");

  test("} moves the selection to the next heading", () => {
    const v = view(OUTLINED);
    v.focus.focus(0);
    v.repaint();
    press(v, "}");
    assert.equal(v.focus.lineIndex, 2);
    assert.equal(selectedRows(v.body).length, 1);
  });

  test("{ moves the selection to the previous heading", () => {
    const v = view(OUTLINED);
    v.focus.focus(6);
    v.repaint();
    press(v, "{");
    assert.equal(v.focus.lineIndex, 5);
  });

  test("2} composes through the real painter, same as 2j would", () => {
    const v = view(OUTLINED);
    v.focus.focus(0);
    v.repaint();
    press(v, "2");
    press(v, "}");
    assert.equal(v.focus.lineIndex, 5);
  });

  test("} on a view with no headings lands on the last line, same as G would", () => {
    const v = view(); // SOURCE has one heading at index 0 and nothing after it to jump to twice
    v.focus.focus(0);
    v.repaint();
    press(v, "}");
    // SOURCE's only heading is the line we started on, so } must fall through to the last line.
    assert.equal(v.focus.lineIndex, SOURCE.split("\n").length - 1);
  });
});

describe("17. a blank line still shows a visible selection mark", () => {
  const WITH_BLANK = ["# This Week", "", "- [ ] a task"].join("\n");

  test("selecting the blank line (index 1) draws a marked, empty row", () => {
    const v = view(WITH_BLANK);
    v.focus.focus(1);
    v.repaint();
    assert.equal(selectedRows(v.body).length, 1, "no mark was drawn for the selected blank line");
    const mark = selectedRows(v.body)[0];
    assert.equal(mark.textContent, "", "the blank line's mark must not carry any text");
    assert.equal(inputs(v.body).length, 0, "a blank line must never become an <input>");
  });

  test("moving off the blank line removes its mark and marks the real line instead", () => {
    const v = view(WITH_BLANK);
    v.focus.focus(1);
    v.repaint();
    press(v, "j");
    assert.equal(v.focus.lineIndex, 2);
    assert.equal(selectedRows(v.body).length, 1);
  });

  test("without a ModeSurface, a blank line draws nothing — unchanged from before this slice", () => {
    globalThis.document = makeDocument();
    const body = makeBody();
    const focus = new FocusSurface();
    focus.focus(1);
    paint(body, WITH_BLANK, new PresentationContext(), { markdown: md, focus });
    assert.equal(selectedRows(body).length, 0, "a blank-line mark appeared with no ModeSurface wired");
  });

  test("the golden config (no focus, no mode) draws nothing for a blank line either", () => {
    globalThis.document = makeDocument();
    const body = makeBody();
    paint(body, WITH_BLANK, new PresentationContext(), { markdown: md });
    assert.equal(body.children.length, 2, "a blank line grew a row with no focus/mode wired at all");
  });
});

describe("18. > and < through the painter — indentedLine drives the same set-line commit x's toggle does", () => {
  test("> indents the selected line by exactly one unit (four spaces), posted as a single set-line commit", () => {
    const v = view();
    v.focus.focus(1); // "- [ ] first task [[qntm:1]] #task"
    v.repaint();
    press(v, ">");
    assert.equal(v.commits.length, 1);
    const posted = v.commits[0].markdown.split("\n")[1];
    assert.equal(posted, "    - [ ] first task [[qntm:1]] #task");
    assert.equal(posted.match(/^ */)[0].length, INDENT_UNIT);
    assert.equal(v.mode.mode, "NORMAL", "> must not open an <input>");
    // Index-stable: the line count and every other line are untouched.
    assert.equal(v.commits[0].markdown.split("\n").length, v.source.split("\n").length);
  });

  test("< outdents back to zero, and > then < round-trips to the byte-identical original view", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, ">");
    const afterIndent = v.commits[0].markdown;
    const v2 = view(afterIndent);
    v2.focus.focus(1);
    v2.repaint();
    press(v2, "<");
    assert.equal(v2.commits[0].markdown, v.source, "> then < did not restore the original file exactly");
  });

  test("< on a line already at zero indent does nothing — no commit posted, not an error", () => {
    const v = view();
    v.focus.focus(1); // no indent on this fixture's lines
    v.repaint();
    press(v, "<");
    assert.deepEqual(v.commits, [], "outdenting a zero-indent line posted an edit");
    assert.equal(v.mode.mode, "NORMAL");
  });

  test("> on the heading does nothing — no commit, same refusal x already gives that line", () => {
    const v = view();
    v.focus.focus(0); // "# This Week"
    v.repaint();
    press(v, ">");
    assert.deepEqual(v.commits, [], "> indented a heading, which stops it being a heading");
  });

  test("3> composes through the real painter, same as 3} would", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "3");
    press(v, ">");
    const posted = v.commits[0].markdown.split("\n")[1];
    assert.equal(posted.match(/^ */)[0].length, 3 * INDENT_UNIT);
  });

  test("a single < after a composed 3> removes exactly one unit, not three — the count does not stick", () => {
    const v = view();
    v.focus.focus(1);
    v.repaint();
    press(v, "3");
    press(v, ">"); // 12 spaces
    const v2 = view(v.commits[0].markdown);
    v2.focus.focus(1);
    v2.repaint();
    press(v2, "<"); // one bare outdent, no count in front of it on this fresh ModeSurface
    assert.equal(v2.commits[0].markdown.split("\n")[1].match(/^ */)[0].length, 2 * INDENT_UNIT);
  });
});

describe("19. w / b / e — motion letter and count only; word.ts decides the caret", () => {
  test("w with no count asks to jump to word 1", () => {
    const mode = new ModeSurface();
    const outcome = mode.handleKey("w", 4, 100);
    assert.equal(outcome.handled, true);
    assert.deepEqual(outcome.effect, { kind: "word", motion: "w", count: 1 });
  });

  test("b and e report their own motion letter the same way", () => {
    const mode = new ModeSurface();
    assert.deepEqual(mode.handleKey("b", 4, 100).effect, { kind: "word", motion: "b", count: 1 });
    assert.deepEqual(mode.handleKey("e", 4, 100).effect, { kind: "word", motion: "e", count: 1 });
  });

  test("3w composes the count exactly like every other motion", () => {
    const mode = new ModeSurface();
    mode.handleKey("3", 0, 100);
    const outcome = mode.handleKey("w", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "word", motion: "w", count: 3 });
  });

  test("handleKey does NOT itself enter INSERT for w/b/e — it does not have the offset yet", () => {
    // The one way this differs from `i`/Enter/`a`: those flip `#mode` inside `handleKey` because
    // they need no offset. `w`/`b`/`e` need `wordCaret` (word.ts), which this module still does
    // not import, so the mode stays NORMAL until the CALLER computes an offset and calls
    // `enterInsert(offset)` itself — see motions.ts's slice 4 note and section 20 below.
    const mode = new ModeSurface();
    mode.handleKey("w", 4, 100);
    assert.equal(mode.mode, "NORMAL", "handleKey flipped to INSERT with no offset in hand");
    assert.equal(mode.takeCaretHint(), undefined, "a caret hint appeared with no offset computed");
  });

  test("the count clears after w fires, same as after any other motion", () => {
    const mode = new ModeSurface();
    mode.handleKey("5", 0, 100);
    mode.handleKey("w", 4, 100);
    const outcome = mode.handleKey("j", 4, 100);
    assert.deepEqual(outcome.effect, { kind: "move", lineIndex: 5 }, "the stale count of 5 survived w");
  });
});

describe("19a. wordCaret (app/present/word.ts) — pure, no DOM, the arithmetic w/b/e need", () => {
  const LINE = "- [ ] first task [[qntm:1]] #task";
  // Chrome is "- [ ] " (6 chars); the title tail is "first task [[qntm:1]] #task", so the two
  // title words are "first" (6-11) and "task" (12-16) — the stamp and the tag are atoms.
  const FIRST = LINE.indexOf("first");
  const TASK = LINE.indexOf("task");

  test("w from column 0 lands at the start of the first title word", () => {
    assert.equal(wordCaret(LINE, "w", 1, 0), FIRST);
  });

  test("w REPEATS — from the first word it goes to the second, which is the whole defect", () => {
    // Before this, every count was measured from a FIXED end of the title, so `w` from the first
    // word returned the first word again and a second `w` could not go anywhere new.
    assert.equal(wordCaret(LINE, "w", 1, FIRST), TASK);
  });

  test("w is STRICT — it never returns the column it was given", () => {
    for (let from = 0; from < LINE.length; from += 1) {
      const at = wordCaret(LINE, "w", 1, from);
      assert.ok(at === null || at !== from || at === TASK, `w returned its own column ${from}`);
    }
  });

  test("2w from column 0 skips a word, exactly as 1w twice does", () => {
    assert.equal(wordCaret(LINE, "w", 2, 0), TASK);
    assert.equal(wordCaret(LINE, "w", 1, wordCaret(LINE, "w", 1, 0)), TASK);
  });

  test("a count past the last word clamps to the last word — no wrap", () => {
    assert.equal(wordCaret(LINE, "w", 99, 0), TASK);
    assert.equal(wordCaret(LINE, "w", 1, TASK), TASK, "w at the last word clamped somewhere else");
  });

  test("e lands on a word's LAST CHARACTER, not one past it — a block cursor sits ON a character", () => {
    const at = wordCaret(LINE, "e", 1, 0);
    assert.equal(at, FIRST + "first".length - 1);
    assert.equal(LINE[at], "t");
  });

  test("e repeats too — from the end of the first word it reaches the end of the second", () => {
    const firstEnd = wordCaret(LINE, "e", 1, 0);
    assert.equal(wordCaret(LINE, "e", 1, firstEnd), TASK + "task".length - 1);
  });

  test("b moves BACKWARD from the cursor, and clamps at the first word rather than wrapping", () => {
    assert.equal(wordCaret(LINE, "b", 1, TASK), FIRST);
    assert.equal(wordCaret(LINE, "b", 1, FIRST), FIRST, "b at the first word wrapped or fell into chrome");
    assert.equal(wordCaret(LINE, "b", 99, LINE.length), FIRST);
  });

  test("b(2) from the end of the line is the second-from-last word", () => {
    assert.equal(wordCaret(LINE, "b", 2, LINE.length), FIRST);
  });

  test("a count of 0 behaves as count 1 — the same floor every other motion applies", () => {
    assert.equal(wordCaret(LINE, "w", 0, 0), wordCaret(LINE, "w", 1, 0));
  });

  test("a line with no title returns null — a bare heading marker, chrome only, blank", () => {
    // "## " (hashes + whitespace + nothing) is a heading with empty text — classifyLine requires
    // the whitespace after the hashes (HEADING's own `\s+`), so "##" with NO trailing space is not
    // a heading at all; it falls through to `prose` and IS one "word", which is a real quirk of
    // classifyLine and not this module's to correct.
    assert.equal(wordCaret("## ", "w", 1, 0), null);
    assert.equal(wordCaret("- [ ] ", "w", 1, 0), null);
    assert.equal(wordCaret("", "w", 1, 0), null);
    assert.equal(wordCaret("   ", "w", 1, 0), null);
  });

  test("no motion, from any column, ever lands inside the identity stamp or the tag", () => {
    // THE TEST THAT MATTERS MOST, and it is now stronger than it was: the old version could only
    // start from a fixed anchor, so it swept counts. This sweeps counts AND every starting column,
    // which is the space a repeatable motion actually reaches.
    for (const line of SOURCE.split("\n")) {
      for (const motion of ["w", "b", "e"]) {
        for (let count = 1; count <= 6; count += 1) {
          for (let from = 0; from <= line.length; from += 1) {
            const at = wordCaret(line, motion, count, from);
            if (at === null) continue;
            const stamp = line.indexOf("[[");
            assert.ok(
              stamp === -1 || at <= stamp || at >= line.indexOf("]]") + 2,
              `${motion}(${count}) from ${from} on ${JSON.stringify(line)} landed inside the stamp`,
            );
            const tagAt = line.indexOf("#task");
            assert.ok(
              tagAt === -1 || at <= tagAt || at >= tagAt + "#task".length,
              `${motion}(${count}) from ${from} on ${JSON.stringify(line)} landed inside the tag`,
            );
          }
        }
      }
    }
  });
});

describe("20. clampColumn — the other axis's arithmetic, beside clampLine's", () => {
  test("the ceiling is the LAST CHARACTER, not one past it — vim's cursor sits ON a character", () => {
    assert.equal(clampColumn(5, "abcdef"), 5);
    assert.equal(clampColumn(6, "abcdef"), 5);
    assert.equal(clampColumn(99, "abcdef"), 5);
  });

  test("an empty line has no character to sit on, so the column floors at zero", () => {
    assert.equal(clampColumn(0, ""), 0);
    assert.equal(clampColumn(7, ""), 0);
  });

  test("a negative or non-finite column is zero, never a negative index", () => {
    assert.equal(clampColumn(-1, "abcdef"), 0);
    assert.equal(clampColumn(Number.NaN, "abcdef"), 0);
  });

  test("null text means there is nothing to measure, so the column passes through", () => {
    assert.equal(clampColumn(42, null), 42);
    assert.equal(clampColumn(-1, null), 0);
  });
});

describe("21. FocusSurface holds the column, and a projection arriving does not take it away", () => {
  const BEFORE = [
    "# This Week",
    "- [ ] a fairly long first task [[qntm:1]] #task",
    "- [ ] second task [[qntm:2]] #task",
  ].join("\n");

  test("landing on a line starts the cursor at its head, and moveColumn moves it along", () => {
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    assert.equal(focus.column, 0);
    focus.moveColumn(12, BEFORE.split("\n")[1]);
    assert.equal(focus.column, 12);
  });

  test("moveColumn clamps into the line it is given rather than trusting the caller", () => {
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    focus.moveColumn(9999, BEFORE.split("\n")[1]);
    assert.equal(focus.column, BEFORE.split("\n")[1].length - 1);
  });

  test("a LINE MOVE resets the column — landing on a line puts the cursor at its head", () => {
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    focus.moveColumn(12, BEFORE.split("\n")[1]);
    focus.focus(2, BEFORE);
    assert.equal(focus.column, 0);
  });

  test("reanchor carries the column across a line INSERTED above the cursor", () => {
    // The exact trap focus.ts's own note warns about: `reanchor` moves the cursor through `focus()`,
    // which resets the column unless one is passed through. It is.
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    focus.moveColumn(12, BEFORE.split("\n")[1]);

    const after = BEFORE.split("\n").flatMap((l, i) => (i === 1 ? ["## Overdue", l] : [l])).join("\n");
    const reading = focus.reanchor(after);
    assert.equal(reading.outcome, "found");
    assert.equal(focus.lineIndex, 2, "the anchor did not follow the line");
    assert.equal(focus.column, 12, "the column was reset by a projection arriving");
  });

  test("reanchor CLAMPS the column when the cycle shortened the line", () => {
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    const long = BEFORE.split("\n")[1];
    focus.moveColumn(long.length - 1, long);

    const short = "- [ ] a [[qntm:1]] #task";
    const after = BEFORE.split("\n").map((l, i) => (i === 1 ? short : l)).join("\n");
    assert.equal(focus.reanchor(after).outcome, "found");
    assert.equal(focus.column, short.length - 1, "the column was left past the end of its line");
    assert.notEqual(focus.column, 0, "the column was reset to zero instead of clamped");
  });

  test("an ambiguous or absent reading moves nothing, the column included", () => {
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    focus.moveColumn(12, BEFORE.split("\n")[1]);
    const gone = ["# This Week", "- [ ] second task [[qntm:2]] #task"].join("\n");
    assert.equal(focus.reanchor(gone).outcome, "absent");
    assert.equal(focus.lineIndex, 1, "an absent line moved the cursor");
    assert.equal(focus.column, 12, "an absent line moved the column");
  });

  test("blur takes the column with it", () => {
    const focus = new FocusSurface();
    focus.focus(1, BEFORE);
    focus.moveColumn(12, BEFORE.split("\n")[1]);
    focus.blur();
    assert.equal(focus.column, 0);
  });
});

describe("22. w / b / e through the painter — the column moves, the mode does NOT", () => {
  /** The whole selected line's characters, as the painter actually built them. */
  const paintedText = (body) =>
    selectedRows(body)
      .flatMap((el) => el.children)
      .map((child) => child.textContent)
      .join("");
  const blockChar = (body) => {
    const cell = walk(body).find((el) => String(el.className ?? "").split(/\s+/).includes("vim-block"));
    return cell === undefined ? null : cell.textContent;
  };

  test("w moves the column and opens NO input — pressed four times", () => {
    const v = view();
    v.focus.focus(1, v.source); // "- [ ] first task [[qntm:1]] #task"
    v.repaint();
    const text = SOURCE.split("\n")[1];

    press(v, "w");
    assert.equal(v.focus.column, text.indexOf("first"));
    press(v, "w");
    assert.equal(v.focus.column, text.indexOf("task"));
    press(v, "w");
    press(v, "w");

    assert.equal(v.mode.mode, "NORMAL", "a word jump entered INSERT — the operator's own complaint");
    assert.equal(inputs(v.body).length, 0, "a word jump opened an editable line");
    assert.equal(paintedText(v.body), text, "the line's characters changed while the cursor moved");
  });

  test("the selected line shows its exact source in NORMAL, with the block on the column", () => {
    const v = view();
    v.focus.focus(1, v.source);
    v.repaint();
    const text = SOURCE.split("\n")[1];
    assert.equal(paintedText(v.body), text, "the selected line is not its exact source text");
    assert.equal(blockChar(v.body), text[0]);
    press(v, "w");
    assert.equal(blockChar(v.body), "f", "the block did not follow w onto 'first'");
    assert.equal(paintedText(v.body), text, "moving the cursor changed the characters");
  });

  test("i then opens INSERT at that same column — one coordinate, two renditions", () => {
    const v = view();
    v.focus.focus(1, v.source);
    v.repaint();
    press(v, "w");
    press(v, "w");
    const column = v.focus.column;
    press(v, "i");
    assert.equal(v.mode.mode, "INSERT");
    const line = inputs(v.body)[0];
    assert.equal(line.value, SOURCE.split("\n")[1], "i changed the line's characters");
    assert.equal(line.selectionStart, column, "i ignored the column the word motions established");
  });

  test("w on a line with no title does nothing: no <input>, mode stays NORMAL, column unmoved", () => {
    const v2 = view("## \n" + SOURCE.split("\n").slice(1).join("\n"));
    v2.focus.focus(0, v2.source);
    v2.repaint();
    press(v2, "w");
    assert.equal(v2.mode.mode, "NORMAL", "w opened INSERT on a line with no title");
    assert.equal(v2.focus.column, 0);
    assert.equal(inputs(v2.body).length, 0);
  });

  test("round trip: w, i, then Escape leaves the source byte-identical and posts nothing", () => {
    const v = view();
    v.focus.focus(2, v.source);
    v.repaint();
    press(v, "w");
    press(v, "i");
    const line = inputs(v.body)[0];
    assert.equal(line.value, SOURCE.split("\n")[2], "the input did not hold the exact source line");
    line.dispatch("keydown", makeEvent({ key: "Escape" }));
    assert.deepEqual(v.commits, [], "Escape posted an edit");
    assert.equal(v.mode.mode, "NORMAL");
    assert.equal(inputs(v.body).length, 0);
    assert.equal(v.source, SOURCE);
  });
});
