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
