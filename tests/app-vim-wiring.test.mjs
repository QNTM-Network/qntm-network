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

describe("a opens INSERT with the caret at the end of the line, through the real page", () => {
  test("the caret lands at the end of the exact source line", () => {
    paintFresh();
    press("j"); // select line 1 — "- [ ] first task…"
    press("a");
    assert.equal(page.__vimMode(), "INSERT");
    const line = inputs(elements.get("viewBody"))[0];
    assert.ok(line, "a did not open an editable line through the page's own wiring");
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.value, text);
    assert.equal(line.selectionStart, text.length, "the caret was not placed at the end of the line");
    assert.equal(line.selectionEnd, text.length);
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
// SLICE 4 — w, b, e, through the same real document-level wiring.
//
// tests/present-motions.test.mjs sections 19/19a/20 already prove the reducer (`w`/`b`/`e` report
// motion+count, `word.ts`'s `wordCaret` decides the offset) and the paint.ts wiring (numeric caret
// hints reach `setSelectionRange`) by hand-assembling the same dispatch app/index.html's own
// keydown handler performs. This is the missing link for THIS gesture specifically: that the
// page's real `effect.kind === "word"` branch — added alongside "move"/"boundary"/"open" — calls
// `wordCaret` and `mode.enterInsert(offset)` the way it is meant to, through the actual script.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("w / b / e open INSERT at a title word, through the real page's own wiring", () => {
  test("w lands the caret at the start of the first title word", () => {
    paintFresh();
    press("j"); // select line 1 — "- [ ] first task [[qntm:1]] #task"
    press("w");
    assert.equal(page.__vimMode(), "INSERT");
    const line = inputs(elements.get("viewBody"))[0];
    assert.ok(line, "w did not open an editable line through the page's own wiring");
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.value, text, "w changed the line's characters");
    assert.equal(line.selectionStart, text.indexOf("first"));
    assert.equal(line.selectionEnd, text.indexOf("first"));
  });

  test("2w lands on the second title word", () => {
    paintFresh();
    press("j");
    press("2");
    press("w");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.selectionStart, text.indexOf("task"));
  });

  test("e lands at the end of the first title word", () => {
    paintFresh();
    press("j");
    press("e");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.selectionStart, text.indexOf("first") + "first".length);
  });

  test("b with no count lands on the LAST title word — there is no established caret to move back from", () => {
    paintFresh();
    press("j");
    press("b");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.selectionStart, text.indexOf("task"));
  });

  test("a count past the title's last word clamps there instead of refusing or wrapping", () => {
    paintFresh();
    press("j");
    press("9");
    press("w");
    assert.equal(page.__vimMode(), "INSERT", "an overrun count refused the motion");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[1];
    assert.equal(line.selectionStart, text.indexOf("task"));
  });

  test("w on the heading — VIEW's line 0, 'This Week' as text but no [[qntm:]] chrome — still opens INSERT normally, proving titleSpans is not checkbox-only", () => {
    paintFresh(); // line 0, "# This Week"
    press("w");
    assert.equal(page.__vimMode(), "INSERT");
    const line = inputs(elements.get("viewBody"))[0];
    const text = VIEW.markdown.split("\n")[0];
    assert.equal(line.selectionStart, text.indexOf("This"));
  });

  test("w on a line with no title does nothing — no network call, no mode or selection change", () => {
    // Reuses the "x on a heading with no checkbox" posture: nothing here should reach the network,
    // so `graphData` (module state every other test in this file shares) is fine to leave as is.
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
    assert.equal(inputs(elements.get("viewBody")).length, 0);
    // Restore the shared VIEW for every test that runs after this one in the file.
    page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  });

  test("Escape after w leaves NORMAL and posts nothing — the round trip through the real page", () => {
    paintFresh();
    press("j");
    press("j"); // line 2 — "- [ ] second task…"
    press("w");
    const line = inputs(elements.get("viewBody"))[0];
    line.dispatch("keydown", makeEvent({ key: "Escape" }));
    assert.equal(page.__vimMode(), "NORMAL");
    assert.equal(page.__focusIndex(), 2, "Escape moved the selection instead of only leaving INSERT");
    assert.equal(inputs(elements.get("viewBody")).length, 0);
  });
});
