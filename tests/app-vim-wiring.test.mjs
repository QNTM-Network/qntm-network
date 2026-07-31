/**
 * VIM NORMAL MODE, THROUGH THE PAGE'S OWN CODE — not through a reconstruction of it.
 *
 *   node --test tests/app-vim-wiring.test.mjs
 *
 * tests/present-motions.test.mjs proves the pure reducer and proves paint.ts obeys it, hand-wired
 * the way app/index.html wires it. This suite is the missing link: the brief's own warning is that
 * "a declaration that exists and does not reach is the single highest-frequency bug class in this
 * system", and app/index.html is a hand-authored page outside every enforcer this repo has —
 * outside tsconfig, outside the bundle, outside flow-trace's capture (node cannot import an HTML
 * document). A suite that reimplemented its keydown wiring in a fixture would stay green while the
 * page rotted, so tests/fixtures/app-html-page.mjs lifts the page's REAL module script and this
 * drives it: the document-level `keydown` listener that ships, firing on the same `document.dispatch`
 * the drawer's own `\` and Escape are already proven through in tests/app-shell.test.mjs.
 *
 * WHAT THIS DOES NOT PROVE: a real browser laying anything out, or a real key event's full field
 * set. `makeEvent` carries only what the page's handlers touch (`key`, `preventDefault`,
 * `stopPropagation`), same as every other suite built on this fixture.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-vim-wiring");

const VIEW = {
  id: "this-week",
  path: "work/outcomes.md",
  title: "This Week",
  domain: "work",
  markdown: [
    "# This Week",
    "- [ ] first task [[qntm:1]] #task",
    "- [ ] second task [[qntm:2]] #task",
    "- [ ] third task [[qntm:3]] #task",
  ].join("\n"),
};

let page;
let elements;
let doc;

before(async () => {
  ({ elements, document: doc } = installBrowser());
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  page = await importPage(WORK);
  page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
});

const inputs = (body) => walk(body).filter((el) => el.tagName === "input" && el.type === "text");
const selected = (body) =>
  walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("vim-selected"));
const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

/**
 * `paintView`, then a deterministic starting line — `gg` rather than an assumption of `0`.
 *
 * `focus`/`mode` are held on the imported page module for the whole file (the same object every
 * test shares, exactly as the real app holds one `FocusSurface` for the whole session), so a test
 * that assumed line 0 without saying so would be asserting on whatever the PREVIOUS test left
 * behind. `gg` is itself one of the bindings under test, so this is not a workaround — it is using
 * the feature to reach a known state, the way a person actually would.
 */
function paintFresh() {
  page.paintView("this-week");
  press("g");
  press("g");
}

describe("vim, wired through app/index.html's own script", () => {
  test("painting a view lands in NORMAL, no <input> open", () => {
    page.paintView("this-week");
    assert.equal(page.__vimMode(), "NORMAL");
    const body = elements.get("viewBody");
    assert.equal(inputs(body).length, 0, "a fresh view opened an editable line unasked");
    assert.equal(selected(body).length, 1, "no line was marked selected");
  });

  test("j, fired at the document exactly like a real keydown, moves the selection down by one", () => {
    paintFresh();
    assert.equal(page.__focusIndex(), 0);
    press("j");
    assert.equal(page.__focusIndex(), 1);
    assert.equal(inputs(elements.get("viewBody")).length, 0);
  });

  test("j is refused while the keystroke's target is a text field — the same guard \\ already earns", () => {
    paintFresh();
    const before = page.__focusIndex();
    doc.dispatch("keydown", makeEvent({ key: "j", target: { tagName: "input" } }));
    assert.equal(page.__focusIndex(), before, "a vim motion fired while typing elsewhere in the chrome");
  });

  test("i opens INSERT on the selected line, holding its exact source characters", () => {
    paintFresh();
    press("j"); // select line 1 — "- [ ] first task…"
    press("i");
    assert.equal(page.__vimMode(), "INSERT");
    const line = inputs(elements.get("viewBody"))[0];
    assert.ok(line, "i did not open an editable line through the page's own wiring");
    assert.equal(line.value, VIEW.markdown.split("\n")[1]);
  });

  test("Escape on the open line returns to NORMAL without posting, and keeps the selection", () => {
    paintFresh();
    press("j");
    press("j"); // line 2 — "- [ ] second task…"
    press("i");
    const line = inputs(elements.get("viewBody"))[0];
    line.value = "- [x] rewritten entirely";
    line.dispatch("keydown", makeEvent({ key: "Escape" }));

    assert.equal(page.__vimMode(), "NORMAL");
    assert.equal(page.__focusIndex(), 2, "Escape moved the selection instead of only leaving INSERT");
    assert.equal(inputs(elements.get("viewBody")).length, 0);
  });

  test("gg and G reach the first and last line through the real page", () => {
    paintFresh();
    press("j");
    press("j");
    assert.equal(page.__focusIndex(), 2);
    press("g");
    press("g");
    assert.equal(page.__focusIndex(), 0);
    press("G");
    assert.equal(page.__focusIndex(), VIEW.markdown.split("\n").length - 1);
  });

  test("switching views forces NORMAL, so an <input> cannot leak into a view nobody is looking at", () => {
    paintFresh();
    press("i");
    assert.equal(page.__vimMode(), "INSERT");
    page.paintView("this-week");
    assert.equal(page.__vimMode(), "NORMAL", "a stray INSERT survived a view (re)paint");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SLICE 2 — a, o/O, x, { and }, through the same real document-level wiring.
//
// WHAT IS DELIBERATELY NOT EXERCISED HERE: `x`'s actual checkbox toggle, which — through the real
// page — ends in an async `POST /app/edit-file` via `commitLine`. `graphData` is module-scoped
// page state shared across every test in this file (there is no per-test reset), and the shared
// `fetch` stub in `before()` returns `{ ok: true }` with no `snapshot`, so letting a real commit
// resolve would either throw inside `commitLine` or overwrite `graphData` with a shape later tests
// do not expect. tests/present-motions.test.mjs's section 15 already proves the computation `x`
// hands to `commitLine` (`classifyLine` finds the checkbox, `applyEdit` flips it, the markdown is
// right) at the paint.ts wiring layer; what is left unverified is the network round trip itself —
// stated plainly, not silently skipped.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("a opens INSERT one past the cursor, through the real page", () => {
  test("at column 0 the caret lands at column 1 — 'after the character under the cursor'", () => {
    paintFresh();
    press("j"); // select line 1 — "- [ ] first task…", column 0
    press("a");
    assert.equal(page.__vimMode(), "INSERT");
    const line = inputs(elements.get("viewBody"))[0];
    assert.ok(line, "a did not open an editable line through the page's own wiring");
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.value, text);
    assert.equal(line.selectionStart, 1, "a did not land one past the cursor's own column");
    assert.equal(line.selectionEnd, 1);
  });

  test("on the line's LAST character a lands at its end — the old behaviour, as a boundary case", () => {
    paintFresh();
    press("j");
    press("$"); // the last character of the line
    press("a");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.selectionStart, text.length, "a on the last character did not reach the end");
    assert.equal(line.selectionEnd, text.length);
  });

  test("i opens at the cursor's own column, which a word motion has moved", () => {
    paintFresh();
    press("j");
    press("w"); // onto "first"
    press("i");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.selectionStart, text.indexOf("first"), "i ignored the column w established");
    assert.equal(line.value, text, "i changed the line's characters");
  });
});

describe("o / O open a new line through the real page's own wiring", () => {
  test("o opens a draft below the selected line and enters INSERT", () => {
    paintFresh();
    press("j"); // select line 1
    press("o");
    assert.equal(page.__vimMode(), "INSERT");
    const body = elements.get("viewBody");
    assert.equal(inputs(body).length, 1, "more than one row is editable at once");
    assert.equal(inputs(body)[0].value, "- [ ] ", "the seed was not the bare unchecked checkbox chrome");
    assert.equal(inputs(body)[0].focused, true, "the cursor did not land in the new line");
  });

  test("O opens a draft above the selected line and enters INSERT", () => {
    paintFresh();
    press("j");
    press("j"); // select line 2
    press("O");
    assert.equal(page.__vimMode(), "INSERT");
    assert.equal(inputs(elements.get("viewBody")).length, 1);
  });
});

describe("x through the real page's own wiring", () => {
  test("x on a line with no checkbox does nothing — no network call, no mode or selection change", () => {
    paintFresh(); // lands on line 0, "# This Week" — a heading, not a checkbox
    press("x");
    assert.equal(page.__vimMode(), "NORMAL");
    assert.equal(page.__focusIndex(), 0, "x moved the selection, which it must never do");
  });
});

describe("{ and } through the real page's own wiring", () => {
  test("} falls through to the last line — VIEW has exactly one heading, at line 0", () => {
    paintFresh();
    press("}");
    assert.equal(page.__focusIndex(), VIEW.markdown.split("\n").length - 1);
  });

  test("{ from the last line returns to the only heading, line 0", () => {
    paintFresh();
    press("G");
    press("{");
    assert.equal(page.__focusIndex(), 0);
  });
});

describe("> and < through the real page's own wiring", () => {
  // WHAT IS DELIBERATELY NOT EXERCISED HERE, FOR THE SAME REASON GIVEN ABOVE FOR `x`: indenting a
  // real checkbox line ends in the same async `POST /app/edit-file` via `commitLine`, against the
  // same shared `fetch` stub that returns no `snapshot`. tests/present-motions.test.mjs sections
  // 8a/8c/18 already prove the computation (`ModeSurface.handleKey` reports the count-composed
  // direction, `indentedLine` decides the text, `applyEdit` posts a single `set-line`) at the
  // paint.ts wiring layer, including the four-space unit, the round trip, and the count. What is
  // left unverified here is only that THIS page's own keydown handler reaches that same branch —
  // proven below on the one line that must NOT reach the network at all: the heading.
  test("> on the heading does nothing — no network call, no mode or selection change", () => {
    paintFresh(); // lands on line 0, "# This Week" — a heading, refused by indentedLine
    press(">");
    assert.equal(page.__vimMode(), "NORMAL");
    assert.equal(page.__focusIndex(), 0, "> moved the selection, which it must never do");
  });

  test("< on the heading does nothing either", () => {
    paintFresh();
    press("<");
    assert.equal(page.__vimMode(), "NORMAL");
    assert.equal(page.__focusIndex(), 0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────────────────────
// SLICE 5 — the cursor has a COLUMN, and w/b/e move it without leaving NORMAL.
//
// THE DEFECT THIS SECTION IS THE ANSWER TO, IN THE OPERATOR'S OWN WORDS: "right now word jump also
// does insert. so i can't jump through it just does first jump then wwww typed". Slice 4 ended `w`
// in `mode.enterInsert(offset)`, so the second `w` was a literal `w` typed into the box it had just
// opened. The first test below is that sentence, executable.
//
// It runs through the page's REAL keydown handler, so it also covers the guard that was the most
// likely way this change could have broken everything: `typingIn(e.target)` refuses every key while
// an `<input>` owns the keystroke, and if NORMAL's selected line had become an `<input>` (the
// readonly-input route, refused in paint.ts on browser-caret evidence) `j`, `k` and `w` would all
// have been swallowed by it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The text of the whole selected line as the page actually painted it, spans concatenated. */
const paintedText = (body) =>
  selected(body)
    .flatMap((el) => el.children)
    .map((child) => child.textContent)
    .join("");

/** The one character the block cursor is sitting on. */
const blockChar = (body) => {
  const cell = walk(body).find((el) => String(el.className ?? "").split(/\s+/).includes("vim-block"));
  return cell === undefined ? null : cell.textContent;
};

describe("w / b / e move the column and STAY in NORMAL — the operator's own complaint", () => {
  test("w w w w moves the column four words and types NOTHING", () => {
    // A FOUR-WORD TITLE, because the complaint is literally `wwww`. The shared VIEW's lines carry
    // two title words each (`[[qntm:N]]` and `#task` are ATOMS a word motion skips, not words), so
    // a fourth `w` there would clamp and prove less than it looks like it proves.
    const TEXT = "- [ ] draft the launch note [[qntm:1]] #task";
    page.__setGraphData({
      snapshot: {
        generated_at: "2026-07-31T00:00:00Z",
        views: [{ ...VIEW, markdown: ["# This Week", TEXT, "- [ ] second [[qntm:2]] #task"].join("\n") }],
      },
    });
    paintFresh();
    press("j"); // line 1 — the four-word title
    const body = elements.get("viewBody");

    assert.equal(page.__focusColumn(), 0, "landing on a line did not start the cursor at its head");

    const columns = [];
    for (let i = 0; i < 4; i += 1) {
      press("w");
      columns.push(page.__focusColumn());
    }

    // ONE. Four presses, four DIFFERENT columns, each further along than the last. This is the
    // whole of "i can't jump through it": before this change every `w` after the first was a
    // character typed into an <input>, so there was no second column at all.
    assert.equal(page.__vimMode(), "NORMAL", "a word jump entered INSERT — the defect itself");
    assert.deepEqual(
      columns,
      [TEXT.indexOf("draft"), TEXT.indexOf("the"), TEXT.indexOf("launch"), TEXT.indexOf("note")],
      "the four w presses did not walk four words",
    );

    // TWO. NOTHING WAS TYPED. No <input> was ever opened, so no `w` could have reached one — and
    // the line's characters on the page are still byte for byte the source's.
    assert.equal(inputs(body).length, 0, "a word jump opened an editable line");
    assert.equal(paintedText(body), TEXT, "the line's characters changed while the cursor moved");

    // THREE. The block cursor is really on the character the column names.
    assert.equal(blockChar(body), "n", "the block cursor is not on the first letter of 'note'");

    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  });

  test("b walks back the way w walked forward, and also stays in NORMAL", () => {
    paintFresh();
    press("j");
    const text = VIEW.markdown.split("\n")[1]; // "- [ ] first task [[qntm:1]] #task"
    press("w");
    press("w");
    assert.equal(page.__focusColumn(), text.indexOf("task"), "w did not reach the second title word");
    press("b");
    assert.equal(page.__focusColumn(), text.indexOf("first"));
    // AND IT CLAMPS AT THE FIRST WORD rather than wrapping or falling into the chrome before it.
    press("b");
    assert.equal(page.__focusColumn(), text.indexOf("first"));
    assert.equal(page.__vimMode(), "NORMAL");
    assert.equal(inputs(elements.get("viewBody")).length, 0);
  });

  test("e lands on a word's LAST character, not one past it — a block cursor sits ON a character", () => {
    paintFresh();
    press("j");
    const text = VIEW.markdown.split("\n")[1];
    press("e");
    assert.equal(page.__focusColumn(), text.indexOf("first") + "first".length - 1);
    assert.equal(blockChar(elements.get("viewBody")), "t", "the block was not on the last letter of 'first'");
    // …and `a` from there is one past it, which is exactly where `e` alone used to put the caret.
    press("a");
    assert.equal(
      inputs(elements.get("viewBody"))[0].selectionStart,
      text.indexOf("first") + "first".length,
    );
  });

  test("a count composes, and an overrun clamps at the last word rather than wrapping", () => {
    const TEXT = "- [ ] draft the launch note [[qntm:1]] #task";
    page.__setGraphData({
      snapshot: {
        generated_at: "2026-07-31T00:00:00Z",
        views: [{ ...VIEW, markdown: ["# This Week", TEXT, "- [ ] second [[qntm:2]] #task"].join("\n") }],
      },
    });
    paintFresh();
    press("j");
    press("3");
    press("w");
    assert.equal(page.__focusColumn(), TEXT.indexOf("launch"), "3w did not skip two words");
    // NINE WORDS FORWARD FROM THE THIRD, ON A FOUR-WORD TITLE: the last word, not a wrap and not a
    // refusal. `[[qntm:1]]` and `#task` are atoms, so "the last word" is `note`.
    press("9");
    press("w");
    assert.equal(page.__focusColumn(), TEXT.indexOf("note"), "an overrun count did not clamp");
    assert.equal(page.__vimMode(), "NORMAL");
    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  });

  test("w on a line with no title does nothing — the column does not move either", () => {
    page.__setGraphData({
      snapshot: {
        generated_at: "2026-07-31T00:00:00Z",
        views: [{ ...VIEW, markdown: "## \n" + VIEW.markdown.split("\n").slice(1).join("\n") }],
      },
    });
    paintFresh(); // "## " — a bare heading marker, no title
    press("w");
    assert.equal(page.__vimMode(), "NORMAL", "w opened INSERT on a line with no title");
    assert.equal(page.__focusIndex(), 0, "w moved the selection, which it must never do");
    assert.equal(page.__focusColumn(), 0);
    assert.equal(inputs(elements.get("viewBody")).length, 0);
    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  });

  test("a line move resets the column, so j after w starts the next line at its head", () => {
    paintFresh();
    press("j");
    press("w");
    press("w");
    assert.ok(page.__focusColumn() > 0);
    press("j");
    assert.equal(page.__focusIndex(), 2);
    assert.equal(page.__focusColumn(), 0, "the column survived a line move");
  });
});

describe("0 and $ — the line's own ends", () => {
  test("$ lands on the last character and 0 comes back to the first", () => {
    paintFresh();
    press("j");
    const text = VIEW.markdown.split("\n")[1];
    press("$");
    assert.equal(page.__focusColumn(), text.length - 1);
    assert.equal(blockChar(elements.get("viewBody")), text[text.length - 1]);
    press("0");
    assert.equal(page.__focusColumn(), 0);
    assert.equal(page.__vimMode(), "NORMAL", "a column motion entered INSERT");
  });

  test("a 0 that CONTINUES a count is still part of the count, not the motion", () => {
    paintFresh();
    press("1");
    press("0");
    press("j"); // 10j — clamped to the last line of a four-line view
    assert.equal(page.__focusIndex(), VIEW.markdown.split("\n").length - 1, "10j was read as 1j then 0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SELECTED LINE IS ITS SOURCE, AND THE GUARD THAT COULD HAVE SWALLOWED NORMAL MODE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("in NORMAL the selected line renders its exact source characters", () => {
  // A REAL LINE FROM THE OPERATOR'S OWN VAULT, read-only on 2026-07-31: ~/qntm/this_week.md:8.
  // Copied here rather than read at test time — a suite that read his live vault would fail
  // whenever a cycle rewrote it, and the point is the SHAPE: eight spaces of indent, a bullet, a
  // checkbox glyph, a two-word title, an identity stamp, two tags and three marker cells. Every one
  // of those is chrome the WIRED rendition hides, which is why "the cursor is on it" and "he can
  // see the characters" are the same requirement.
  const REAL = "        - [ ] Pay aug [[qntm:1234]] #task #personal 📅 2026-08-28 🛫 2026-07-28 🆕 2026-06-28";
  const REAL_VIEW = {
    ...VIEW,
    id: "real",
    markdown: ["# This Week", "## Overdue", REAL, "- [ ] another [[qntm:9]] #task"].join("\n"),
  };

  test("every character of a real stamped, tagged, marked line is on the page — in NORMAL", () => {
    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [REAL_VIEW] } });
    page.paintView("real");
    press("g");
    press("g");
    press("j");
    press("j"); // line 2 — the real one
    const body = elements.get("viewBody");

    assert.equal(page.__vimMode(), "NORMAL", "this must be true IN NORMAL, which is the whole defect");
    assert.equal(inputs(body).length, 0, "the line became an <input>, which NORMAL must not do");
    assert.equal(paintedText(body), REAL, "the selected line is not its exact source text");

    // The chrome the wired rendition would have eaten, named one at a time so a failure says which.
    for (const token of ["        ", "- [ ] ", "[[qntm:1234]]", "#task", "#personal", "📅 2026-08-28", "🆕 2026-06-28"]) {
      assert.ok(paintedText(body).includes(token), `the raw rendition lost ${token}`);
    }

    // And the OTHER lines are unaffected — this is a fact about one line, not a mode for the view.
    assert.equal(
      walk(body).filter((el) => el.type === "checkbox").length,
      1,
      "the unselected task line stopped rendering as a checkbox",
    );

    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  });

  test("j and k still work once the selected line shows its source — the typingIn guard is untouched", () => {
    // THE MOST LIKELY WAY THIS CHANGE COULD HAVE BROKEN EVERYTHING. app/index.html refuses every
    // vim key while `typingIn(e.target)` (`tagName === "input"`). Had the selected line become a
    // readonly `<input>` that the painter focuses, it would be `e.target` for every keystroke that
    // followed and NORMAL mode would have stopped answering. It is a `<div>`, so it is not, and
    // this walks the whole view to prove the keys still land.
    paintFresh();
    const last = VIEW.markdown.split("\n").length - 1;
    for (let i = 0; i < last; i += 1) {
      press("j");
      assert.equal(page.__focusIndex(), i + 1, `j stopped answering at line ${i}`);
      assert.equal(selected(elements.get("viewBody")).length, 1, "the selection mark was lost");
    }
    for (let i = last; i > 0; i -= 1) {
      press("k");
      assert.equal(page.__focusIndex(), i - 1, `k stopped answering at line ${i}`);
    }
    assert.equal(inputs(elements.get("viewBody")).length, 0, "walking the view opened an <input>");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE COLUMN SURVIVES A PROJECTION ARRIVING — clamped into the line's NEW characters.
//
// focus.ts's `reanchor` carried a warning that a column added as a third field would be silently
// reset on every arrival, because `reanchor` moves the cursor through `focus()` and `focus()` owned
// the index and the anchor and nothing else. This is that warning, held.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("a projection arriving does not take the column away", () => {
  const STAMPED = [
    "# This Week",
    "- [ ] a fairly long first task [[qntm:1]] #task",
    "- [ ] second task [[qntm:2]] #task",
  ].join("\n");

  /** Re-paint the SAME view id with a new markdown — which is what a cycle landing looks like. */
  const arrive = (markdown) => {
    page.__setGraphData({
      snapshot: { generated_at: "2026-07-31T00:01:00Z", views: [{ ...VIEW, id: "arriving", markdown }] },
    });
    page.paintView("arriving");
  };

  test("the line moves, the column stays where the operator put it", () => {
    arrive(STAMPED);
    press("g");
    press("g");
    press("j"); // line 1, the stamped one
    press("w");
    press("w");
    const column = page.__focusColumn();
    assert.ok(column > 0, "the fixture did not move the column at all");

    // A cycle inserts a heading ABOVE the cursor's line. Every index below it shifts by one; the
    // anchor finds the line by its `[[qntm:1]]` stamp and the column comes with it.
    arrive(STAMPED.split("\n").flatMap((l, i) => (i === 1 ? ["## Overdue", l] : [l])).join("\n"));
    assert.equal(page.__focusIndex(), 2, "the anchor did not follow the line");
    assert.equal(page.__focusColumn(), column, "the column was reset by a projection arriving");
  });

  test("the line gets SHORTER, and the column is clamped into it rather than left past the end", () => {
    arrive(STAMPED);
    press("g");
    press("g");
    press("j");
    press("$"); // the last character of a long line
    const wasAt = page.__focusColumn();

    const shorter = "- [ ] a [[qntm:1]] #task";
    assert.ok(shorter.length - 1 < wasAt, "the fixture's short line is not actually shorter");
    arrive(STAMPED.split("\n").map((l, i) => (i === 1 ? shorter : l)).join("\n"));

    assert.equal(page.__focusIndex(), 1);
    assert.equal(
      page.__focusColumn(),
      shorter.length - 1,
      "the column was left pointing past the end of the line it is in",
    );
    assert.notEqual(page.__focusColumn(), 0, "the column was reset to zero instead of clamped");
  });

  test("the line gets LONGER, and the column is left exactly where it was", () => {
    arrive(STAMPED);
    press("g");
    press("g");
    press("j");
    press("w");
    const column = page.__focusColumn();

    arrive(STAMPED.split("\n").map((l, i) => (i === 1 ? l + " 📅 2026-08-01" : l)).join("\n"));
    assert.equal(page.__focusColumn(), column, "a longer line moved a column that still fits it");
    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  });
});
